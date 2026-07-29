import { getDB, isProgressOutboxRecord, type OutboxRecord } from './db';
import { graphqlClient, progressMutations } from '@/shared/services/api/graphql';
import { getApiPath } from '@/shared/utils/api';

/**
 * Write-ahead outbox для мутаций прогресса (Task 25, .ai-factory/plans/feature-offline-pwa.md).
 *
 * Не ветвление online/offline: мутация ВСЕГДА пишется в outbox → немедленно пытаемся
 * отправить → запись удаляется ТОЛЬКО после подтверждения сервера. `navigator.onLine`
 * не используется — он врёт; «офлайн» — это просто факт неуспеха попытки отправки.
 * Постановка в очередь всегда резолвится успехом (не throw), даже если немедленная
 * отправка не удалась — иначе caller'ы пробрасывают ошибку и ломают optimistic UI.
 * Offline — не особый случай: любая неудача (сеть или сервер) одинаково оставляет
 * запись в очереди для повторной попытки Sync-движком (Task 26).
 */

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[offline/outbox]', ...args);
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Строго монотонный timestamp для outbox-записей. Обычный `Date.now()` (мс-точность)
 * легко коллизирует при двух enqueue подряд в одном тике (напр. быстрый двойной тап) —
 * это ломает LWW-порядок при replay (Task 26 полагается на строгий возрастающий `ts`).
 */
let lastTs = 0;
function monotonicTs(): number {
  const now = Date.now();
  lastTs = now > lastTs ? now : lastTs + 1;
  return lastTs;
}

/** Единичная мутация (`updateProgress`, PlanContext.tsx:168). */
export async function enqueueSingleProgress(
  dayId: number,
  count: number | null,
  completedItems?: number[]
): Promise<void> {
  const record: OutboxRecord = {
    kind: 'progress',
    id: newId(),
    op: 'single',
    dayIds: [dayId],
    count,
    completedItems,
    ts: monotonicTs(),
  };
  await writeAndReplay(record);
}

/** Батч-мутация (`toggleCompleteMany` → `updateProgressBatch`, PlanContext.tsx:362). */
export async function enqueueBatchProgress(dayIds: number[], completed: boolean): Promise<void> {
  const record: OutboxRecord = {
    kind: 'progress',
    id: newId(),
    op: 'batch',
    dayIds,
    count: null,
    completed,
    ts: monotonicTs(),
  };
  await writeAndReplay(record);
}

/**
 * Рукописные пометки песни (M10). Запись всегда идёт через очередь, как и прогресс:
 * ветвление online/offline здесь было бы вторым источником истины.
 */
export async function enqueueSongAnnotations(
  songId: number,
  payload: { strokes: unknown[]; updatedAt: number }
): Promise<void> {
  const record: OutboxRecord = {
    kind: 'songAnnotations',
    // id ДЕТЕРМИНИРОВАННЫЙ: новая правка тех же пометок заменяет предыдущую запись
    // в очереди, а не копит их — отправлять промежуточные состояния бессмысленно.
    id: `songAnnotations:${songId}`,
    songId,
    payload,
    ts: monotonicTs(),
  };
  await writeAndReplay(record);
}

async function writeAndReplay(record: OutboxRecord): Promise<void> {
  try {
    const db = await getDB();
    await db.put('outbox', record);
  } catch (err) {
    // IDB недоступна (приватный режим Safari и т.п.) — деградируем на fire-and-forget
    // отправку без очереди, чтобы хотя бы онлайн-путь продолжал работать.
    debug('IDB write failed, sending without outbox', record.id, err);
    await attemptSend(record);
    return;
  }

  await attemptSend(record).then((ok) => {
    if (ok) return removeOutboxRecord(record.id);
    debug('immediate send failed, record stays queued', record.id);
  });
}

/** Пытается отправить запись на сервер. true — подтверждено, false — оставить в очереди. */
export async function attemptSend(record: OutboxRecord): Promise<boolean> {
  try {
    if (!isProgressOutboxRecord(record)) {
      const res = await fetch(getApiPath(`/api/songs/${record.songId}/state`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record.payload),
      });
      // 4xx повторять бессмысленно (битое тело, чужая песня) — иначе запись висит
      // в очереди вечно и на каждом триггере синка бьётся о ту же ошибку.
      if (!res.ok && res.status >= 400 && res.status < 500) {
        debug('song annotations rejected permanently, dropping', record.id, res.status);
        return true;
      }
      return res.ok;
    }
    if (record.op === 'single') {
      const dayId = record.dayIds[0];
      await graphqlClient.mutate(progressMutations.updateProgress(dayId, record.count, record.completedItems));
    } else {
      await graphqlClient.mutate(progressMutations.updateProgressBatch(record.dayIds, record.completed ?? false));
    }
    return true;
  } catch (err) {
    debug('send failed', record.id, err);
    return false;
  }
}

export async function removeOutboxRecord(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('outbox', id);
  } catch (err) {
    debug('failed to remove outbox record', id, err);
  }
}

export async function getPendingOutbox(): Promise<OutboxRecord[]> {
  try {
    const db = await getDB();
    return await db.getAllFromIndex('outbox', 'by-ts');
  } catch (err) {
    debug('failed to read outbox', err);
    return [];
  }
}

export interface ProgressOverlayEntry {
  count: number | null;
  completedItems: number[] | null;
}

/**
 * Строит оверлей ожидающих подтверждения мутаций поверх снапшота прогресса —
 * иначе офлайн-отметки визуально «пропадают» после reload, хотя лежат в очереди
 * (fetchPlan читает устаревший снапшот `/api/user/progress` из IDB apiCache, Task 31).
 * Записи применяются по возрастанию `ts` (LWW по dayId), как и при replay (Task 26).
 */
export async function getPendingOutboxOverlay(): Promise<Map<number, ProgressOverlayEntry>> {
  const records = await getPendingOutbox();
  const overlay = new Map<number, ProgressOverlayEntry>();

  for (const record of records) {
    if (!isProgressOutboxRecord(record)) continue;
    if (record.op === 'single') {
      const dayId = record.dayIds[0];
      overlay.set(dayId, {
        count: record.count,
        completedItems: record.completedItems ?? null,
      });
    } else {
      const entry: ProgressOverlayEntry = {
        count: record.completed ? null : 0,
        completedItems: null,
      };
      record.dayIds.forEach((dayId) => overlay.set(dayId, entry));
    }
  }

  return overlay;
}
