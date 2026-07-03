import { getDB, type ManifestRecord } from './db';
import { persistApiCache } from './readThrough';
import { getPendingOutbox } from './outbox';
import { replayOutbox } from './sync';
import { getApiPath } from '@/shared/utils/api';
import { planApi, songsApi, weeklyPlanApi } from '@/shared/services/api/endpoints';
import type { BibleTranslationId } from '@/lib/bible-translations';

/**
 * Download manager: opt-in загрузка Писания/песен/плана в IDB + navigator.storage.persist()
 * (Task 27) и очистка offline-хранилища (Task 28),
 * .ai-factory/plans/feature-offline-pwa.md. Все данные пишутся в IDB — SW-кеш в
 * загрузке/очистке не участвует.
 */

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[offline/downloadManager]', ...args);
}

interface BulkTranslationPayload {
  translation: string;
  books: Record<string, { name: string; chapters: Record<string, string> }>;
}

/**
 * Просит браузер не выселять IndexedDB/Cache API под давлением диска. Без этого
 * Safari/Chrome могут молча стереть скачанные данные (реальная потеря ~6 MB для
 * офлайн-PWA на iOS). Безопасно вызывать многократно.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    debug('storage.persist() not supported in this browser');
    return false;
  }
  try {
    const granted = await navigator.storage.persist();
    debug('storage.persist() result:', granted);
    return granted;
  } catch (err) {
    debug('storage.persist() failed', err);
    return false;
  }
}

async function writeManifestEntry(key: string, entry: Omit<ManifestRecord, 'key'>): Promise<void> {
  const db = await getDB();
  await db.put('manifest', { key, ...entry });
}

export async function getManifest(): Promise<ManifestRecord[]> {
  try {
    const db = await getDB();
    return await db.getAll('manifest');
  } catch (err) {
    debug('failed to read manifest', err);
    return [];
  }
}

/**
 * Bulk-загрузка целого перевода (1 запрос, Task 22) → IDB `bibleChapters`. Прогресс —
 * по Content-Length через reader стрима ответа (может быть недоступен — тогда просто
 * без промежуточного прогресса).
 */
export async function downloadBibleTranslation(
  translationId: BibleTranslationId,
  onProgress?: (loadedBytes: number, totalBytes: number | null) => void
): Promise<void> {
  await requestPersistentStorage();

  const response = await fetch(getApiPath(`/api/bible/download/${translationId}`), {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to download translation "${translationId}": HTTP ${response.status}`);
  }

  const totalBytes = Number(response.headers.get('content-length')) || null;
  const reader = response.body?.getReader();
  let text: string;
  let loadedBytes = 0;

  if (reader) {
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.byteLength;
        onProgress?.(loadedBytes, totalBytes);
      }
    }
    const merged = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder('utf-8').decode(merged);
  } else {
    text = await response.text();
    loadedBytes = text.length;
  }

  const payload = JSON.parse(text) as BulkTranslationPayload;

  const db = await getDB();
  const tx = db.transaction('bibleChapters', 'readwrite');
  const now = Date.now();
  let itemCount = 0;

  for (const [bookName, bookData] of Object.entries(payload.books)) {
    for (const [chapterStr, chapterText] of Object.entries(bookData.chapters)) {
      const chapter = Number(chapterStr);
      await tx.store.put({
        key: `${payload.translation}|${bookName}|${chapter}`,
        translationId: payload.translation,
        book: bookName,
        chapter,
        text: chapterText,
        updatedAt: now,
      });
      itemCount++;
    }
  }
  await tx.done;

  await writeManifestEntry(payload.translation, { downloadedAt: now, sizeBytes: loadedBytes, itemCount });
  debug('downloaded translation', payload.translation, { itemCount, loadedBytes });
}

/**
 * Список песен отдаёт только карточки — контент качается по одной песне за раз
 * (`/api/songs/[id]`) и пишется в IDB `songs`.
 */
export async function downloadSongs(onProgress?: (done: number, total: number) => void): Promise<void> {
  await requestPersistentStorage();

  const list = await songsApi.getSongs();
  const db = await getDB();
  const now = Date.now();
  let done = 0;

  for (const summary of list.songs) {
    const full = await songsApi.getSong(summary.id);
    await db.put('songs', { id: full.song.id, data: full.song, updatedAt: now });
    done++;
    onProgress?.(done, list.songs.length);
  }

  await writeManifestEntry('songs', { downloadedAt: now, itemCount: list.songs.length });
  debug('downloaded songs', { itemCount: list.songs.length });
}

/**
 * Прогрев apiCache планом/недельным планом/списком книг — те же ключи, что читает
 * network-first read-through (Task 31), поэтому офлайн после этой загрузки отдаёт
 * актуальный снимок без отдельного кода чтения.
 */
export async function downloadPlan(): Promise<void> {
  await requestPersistentStorage();

  const [planRes, weeklyRes, booksRes] = await Promise.all([
    planApi.getPlan(),
    weeklyPlanApi.getWeeklyPlan('proverbs'),
    fetch(getApiPath('/api/bible/books'), { credentials: 'include' }).then((r) => r.json()),
  ]);

  await Promise.all([
    persistApiCache('plan:days', planRes),
    persistApiCache('plan:weekly:proverbs', weeklyRes),
    persistApiCache('bible:books', booksRes),
  ]);

  await writeManifestEntry('plan', { downloadedAt: Date.now() });
  debug('downloaded plan warm-up (plan/weekly/books)');
}

export interface ClearOfflineDataResult {
  cleared: boolean;
  /** Сколько outbox-записей всё ещё не подтверждены сервером после попытки sync. */
  pendingOutboxCount: number;
}

/**
 * Очищает данные offline-хранилища (Task 28): `bibleChapters`, `songs`, `apiCache`,
 * `manifest`. НЕ трогает SW-кеш app shell и регистрацию SW — это отдельная система
 * (Task 21). НЕ трогает `meta` (last-known-user живёт там и чистится только на
 * logout, Task 24) — иначе очистка офлайн-данных выкидывает пользователя из
 * офлайн-входа.
 *
 * Если в outbox остался несинканный прогресс — сначала пытается его отправить
 * (`replayOutbox`); если после этого записи всё ещё не подтверждены (нет сети),
 * по умолчанию отказывается чистить и возвращает `cleared: false`, чтобы UI мог
 * предупредить пользователя. `force: true` чистит данные всё равно (сам outbox
 * не трогается — несинканные мутации останутся в очереди и продолжат попытки).
 */
export async function clearAllOfflineData(options?: { force?: boolean }): Promise<ClearOfflineDataResult> {
  await replayOutbox();
  const pending = await getPendingOutbox();

  if (pending.length > 0 && !options?.force) {
    debug('refusing to clear: unsynced outbox records remain', pending.length);
    return { cleared: false, pendingOutboxCount: pending.length };
  }

  const db = await getDB();
  await Promise.all([
    db.clear('bibleChapters'),
    db.clear('songs'),
    db.clear('apiCache'),
    db.clear('manifest'),
  ]);

  debug('offline data cleared', { pendingOutboxCount: pending.length });
  return { cleared: true, pendingOutboxCount: pending.length };
}
