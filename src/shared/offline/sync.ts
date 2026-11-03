import { getPendingOutbox, attemptSend, removeOutboxRecord } from './outbox';
import { isProgressOutboxRecord } from './db';
import { raceNetwork } from './networkHealth';
import { getLastKnownUser } from './lastKnownUser';
import { getDB } from './db';
import { OFFLINE_OWNER_META_KEY } from './offlineOwner';
import { getApiPath } from '@/shared/utils/api';

/**
 * Sync-движок: replay outbox (Task 26, .ai-factory/plans/feature-offline-pwa.md).
 * Триггеры — старт приложения + `visibilitychange` + `online` (одного `online` мало —
 * в Safari/iOS событие капризное). Хост-компонент (sync-провайдер) подключается в
 * dashboard/layout.tsx в Task 30 — этот модуль только логика.
 */

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[offline/sync]', ...args);
}

const HEALTH_PING_TIMEOUT_MS = 4000;

/**
 * `online`-событие в браузере значит «есть сетевой интерфейс», не «сервер
 * достижим» (lie-fi: мёртвая сота, Wi-Fi без аплинка). Пингуем именно
 * `/api/health` (НЕ `/health`) — routeStrategy в SW пропускает `/api/*`
 * passthrough, а не-`/api` HTML-путь SW мог бы отдать из HTML-кеша, и пинг
 * молча вернул бы true в офлайне.
 */
export async function isServerReachable(): Promise<boolean> {
  try {
    const res = await raceNetwork(
      fetch(getApiPath('/api/health'), { method: 'GET', cache: 'no-store' }),
      HEALTH_PING_TIMEOUT_MS
    );
    return res.ok;
  } catch {
    return false;
  }
}

let replayInFlight = false;

/**
 * Отправляет все ожидающие подтверждения outbox-записи серверу, в порядке `ts`
 * (старые → новые). Идемпотентен и защищён от параллельного запуска — повторный
 * вызов, пока предыдущий ещё выполняется, no-op.
 *
 * Каждая мутация — это "set", а не дельта, поэтому строго возрастающий порядок
 * отправки сам по себе даёт корректный LWW-результат на сервере. Отдельно —
 * dedup: запись, для КАЖДОГО из своих dayId полностью перекрытая более поздней
 * записью, считается устаревшей и удаляется без отправки (экономия запросов после
 * долгого офлайна с повторными тогглами одного дня).
 */
export async function replayOutbox(): Promise<void> {
  if (!(await isOutboxOwnedBySession())) {
    debug('outbox owner not confirmed for the signed-in user — replay skipped');
    return;
  }
  if (replayInFlight) {
    debug('replay already in flight, skipping');
    return;
  }
  replayInFlight = true;

  try {
    const pending = await getPendingOutbox(); // ascending ts

    const winnerIdByDay = new Map<number, string>();
    for (const record of pending) {
      // Не-прогрессные записи в dedup по дням не участвуют — у пометок ключ свой
      // (детерминированный id на песню), и вторая запись их вытесняет ещё в очереди.
      if (!isProgressOutboxRecord(record)) continue;
      for (const dayId of record.dayIds) {
        winnerIdByDay.set(dayId, record.id); // later record in ascending-ts order overwrites
      }
    }
    const relevantIds = new Set(winnerIdByDay.values());

    for (const record of pending) {
      if (isProgressOutboxRecord(record) && !relevantIds.has(record.id)) {
        debug('dropping fully superseded record', record.id, record.dayIds);
        await removeOutboxRecord(record.id);
        continue;
      }

      // Пользователь мог смениться за время реплея — дальше записи не отправляем.
      if (!(await isOutboxOwnedBySession())) {
        debug('outbox owner changed during replay — stopping');
        return;
      }
      const ok = await attemptSend(record);
      if (ok) {
        await removeOutboxRecord(record.id);
      } else {
        debug('replay send failed, will retry on next trigger', record.id);
      }
    }
  } finally {
    replayInFlight = false;
  }
}

/**
 * Записи outbox уходят с cookie текущей сессии, поэтому реплей разрешён только когда
 * владелец устройства совпадает с последним подтверждённым сервером пользователем.
 * Иначе записи остаются в IDB до подтверждения (или очистки при входе другого).
 */
async function isOutboxOwnedBySession(): Promise<boolean> {
  try {
    const known = await getLastKnownUser<{ directus_id?: unknown }>();
    const id = known?.directus_id;
    if (typeof id !== 'string' || id === '') return false;
    const db = await getDB();
    const owner = await db.get('meta', OFFLINE_OWNER_META_KEY);
    return owner?.value === id;
  } catch (err) {
    debug('owner check failed', err);
    return false;
  }
}

/**
 * Подписывается на `visibilitychange` (вкладка вернулась в фокус) и `online`.
 * Не вызывает replayOutbox() сразу — caller решает, когда сделать "app start" replay
 * (обычно в том же эффекте, что монтирует эти триггеры).
 * Возвращает функцию отписки.
 */
export function registerSyncTriggers(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {};
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void replayOutbox();
  };
  const onOnline = () => {
    debug('online event — pinging server');
    void isServerReachable().then((reachable) => {
      if (!reachable) {
        debug('server unreachable, skip replay');
        return;
      }
      debug('server reachable, replaying outbox');
      void replayOutbox();
    });
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', onOnline);
  };
}
