import { getDB, type ManifestRecord } from './db';
import { SONGS_LIST_CACHE_KEY, persistApiCache } from './readThrough';
import { readAnnotations } from '@/features/songs/lib/songAnnotationsStore';
import { getPendingOutbox } from './outbox';
import { replayOutbox } from './sync';
import { getApiPath } from '@/shared/utils/api';
import { warmAppShell } from './appShell';
import { planApi, progressApi, songsApi, weeklyPlanApi, setlistsApi } from '@/shared/services/api/endpoints';
import { SETLISTS_LIST_CACHE_KEY, setlistCacheKey } from '@/features/setlists/lib/offlineSetlists';
import type { BibleTranslationId } from '@/lib/bible-translations';
import { forEachWithConcurrency } from './concurrency';

/**
 * Download manager: opt-in загрузка Писания/песен/плана в IDB + navigator.storage.persist()
 * (Task 27) и очистка offline-хранилища (Task 28),
 * .ai-factory/plans/feature-offline-pwa.md. Все данные пишутся в IDB — SW-кеш в
 * загрузке/очистке не участвует.
 *
 * **Единственное место в `shared/offline`, которому разрешён импорт из `features/*`**
 * (`offlineSetlists`, `songAnnotationsStore`). Это оркестратор прогрева: чтобы «скачал
 * всё» и экран читали ОДНИ И ТЕ ЖЕ ключи и одним и тем же вызовом, он обязан знать
 * фиче-локальные слои — рассинхрон писателя и читателя здесь уже давал реальные баги
 * (`useSongs` vs `downloadSongs`).
 *
 * Отвергнутые альтернативы (не переделывать «на чистоту», не разобравшись):
 * - реестр с регистрацией из фичи — прогрев молча выключается, если модуль фичи не
 *   загружен к моменту загрузки; тихий пропуск хуже нарушения слоёв;
 * - инъекция функций прогрева параметрами — их пришлось бы тащить через `AuthProvider`
 *   → `autoDownload` и через пропсы `OfflineDataSection` (фича не может импортировать
 *   другую фичу), то есть три слоя плумбинга ради одного вызова.
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
 * Песни качаются по одной (деталь + пометки) — последовательно это ~250 мс × размер
 * каталога, и первый запуск новичка тянулся на десятки секунд. 6 — столько соединений
 * на хост держит браузер по HTTP/1.1: больше параллелить бессмысленно.
 */
const SONG_DOWNLOAD_CONCURRENCY = 6;

/**
 * Список песен отдаёт только карточки — контент качается запросом на песню (пулом
 * `SONG_DOWNLOAD_CONCURRENCY`)
 * (`/api/songs/[id]`) и пишется в IDB `songs`.
 *
 * Сам список тоже кладётся в apiCache под ключом, который читает `useSongs`. Без этого
 * «скачал песни, ни разу не открыв вкладку онлайн» → офлайн read-through по `songs:list`
 * не находит кеша, уходит в ветку «нет фолбэка — ждём сеть» и список висит вечно, хотя
 * контент всех песен уже лежит в IDB (та же ошибка, что чинил downloadPlan ниже).
 */
export async function downloadSongs(onProgress?: (done: number, total: number) => void): Promise<void> {
  await requestPersistentStorage();

  const list = await songsApi.getSongs();
  // Пишем до цикла: даже прерванная на середине загрузка оставит рабочий список офлайн.
  await persistApiCache(SONGS_LIST_CACHE_KEY, list);

  const db = await getDB();
  const now = Date.now();
  let done = 0;

  await forEachWithConcurrency(list.songs, SONG_DOWNLOAD_CONCURRENCY, async (summary) => {
    const full = await songsApi.getSong(summary.id);
    await db.put('songs', { id: full.song.id, data: full.song, updatedAt: now });
    // Личные пометки греются ТЕМ ЖЕ вызовом, которым их читает экран песни
    // (`readAnnotations` пишет в IDB после успешной сети) — иначе «скачал песни»
    // даёт офлайн лист без пометок. Сбой пометок не роняет загрузку каталога.
    await readAnnotations(full.song.id).catch(() => undefined);
    done++;
    onProgress?.(done, list.songs.length);
  });

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

  const [planRes, progressRes, weeklyRes, booksRes] = await Promise.all([
    planApi.getPlan(),
    // plan:progress прогреваем тем же логическим ключом, что читает PlanContext.fetchPlan.
    // Без этого «скачал всё, ни разу не открыв план онлайн» → офлайн read-through по
    // plan:progress не находит кеша и роняет весь дашборд в «Load failed» (см. FIX_PLAN).
    progressApi.getProgress(),
    weeklyPlanApi.getWeeklyPlan('proverbs'),
    fetch(getApiPath('/api/bible/books'), { credentials: 'include' }).then((r) => r.json()),
  ]);

  await Promise.all([
    persistApiCache('plan:days', planRes),
    persistApiCache('plan:progress', progressRes),
    persistApiCache('plan:weekly:proverbs', weeklyRes),
    persistApiCache('bible:books', booksRes),
  ]);

  await warmAppShell();

  await writeManifestEntry('plan', { downloadedAt: Date.now() });
  debug('downloaded plan warm-up (plan/weekly/books + app-shell routes)');
}

/**
 * Греет apiCache списком сетов и деталью КАЖДОГО сета — не только список: рассинхрон
 * list↔detail уже давал «офлайн: не открывается песня» на других фичах (см. downloadSongs).
 * Деталь сета, недоступная одним запросом (сеть упала на середине), не должна ронять
 * прогрев остальных — ошибка одного сета логируется и не прерывает цикл.
 */
export async function downloadSetlists(): Promise<void> {
  await requestPersistentStorage();

  const list = await setlistsApi.getSetlists();
  await persistApiCache(SETLISTS_LIST_CACHE_KEY, list);

  let warmed = 0;
  for (const summary of list.setlists) {
    try {
      const detail = await setlistsApi.getSetlist(summary.id);
      await persistApiCache(setlistCacheKey(summary.id), detail);
      warmed++;
    } catch (err) {
      debug('failed to warm setlist detail', summary.id, err);
    }
  }

  await writeManifestEntry('setlists', { downloadedAt: Date.now(), itemCount: list.setlists.length });
  debug('setlists warmed:', warmed, 'of', list.setlists.length);
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
    db.clear('songState'),
  ]);

  debug('offline data cleared', { pendingOutboxCount: pending.length });
  return { cleared: true, pendingOutboxCount: pending.length };
}

/* ------------------------------------------------------------------------ *
 * Дельта-синк (см. .ai-factory/plans/feature-offline-cache-first.md, T14)
 * ------------------------------------------------------------------------ */

export interface DeltaStats {
  checked: number;
  updated: number;
  removed: number;
}

/**
 * Догружает песни, чьи версии в манифесте разошлись с локальными, и удаляет те, которых
 * в манифесте больше нет (полный список id заменяет tombstones).
 *
 * Пишет ТЕМИ ЖЕ путями, что читают экраны: стор `songs` (читает `readSongThroughSWR`) и
 * `SONGS_LIST_CACHE_KEY` (читает `useSongs`) — писатель и читатель обязаны совпадать.
 *
 * Возвращает НОВУЮ карту версий; вызывающий записывает её только после успеха целиком —
 * частичный сбой не должен зафиксировать версию недокачанного.
 */
export async function syncSongsDelta(
  manifestSongs: Array<[string, string]>,
  storedVersions: Record<string, string>
): Promise<{ stats: DeltaStats; versions: Record<string, string> }> {
  const db = await getDB();
  const versions: Record<string, string> = { ...storedVersions };
  const stats: DeltaStats = { checked: manifestSongs.length, updated: 0, removed: 0 };

  const manifestIds = new Set(manifestSongs.map(([id]) => id));

  const changed = manifestSongs.filter(([id, version]) => storedVersions[id] !== version);
  await forEachWithConcurrency(changed, SONG_DOWNLOAD_CONCURRENCY, async ([id, version]) => {
    debug('delta: песня изменилась', { id, from: storedVersions[id] ?? '—', to: version });
    const full = await songsApi.getSong(id);
    await db.put('songs', { id: full.song.id, data: full.song, updatedAt: Date.now() });
    // Пометки греются тем же вызовом, которым их читает экран песни.
    await readAnnotations(full.song.id).catch(() => undefined);
    versions[id] = version;
    stats.updated++;
  });

  // Снятая с публикации песня иначе живёт в IDB вечно.
  const localIds = await db.getAllKeys('songs');
  for (const localId of localIds) {
    const id = String(localId);
    if (manifestIds.has(id)) continue;
    debug('delta: песня удалена на сервере', { id });
    await db.delete('songs', id);
    await db.delete('apiCache', `songs:item:${id}`);
    delete versions[id];
    stats.removed++;
  }

  if (stats.updated > 0 || stats.removed > 0) {
    // Список содержит title/plainText изменившихся песен — освежаем той же записью,
    // что читает `useSongs`.
    await persistApiCache(SONGS_LIST_CACHE_KEY, await songsApi.getSongs());
  }

  return { stats, versions };
}

/**
 * То же для сетов: изменившиеся детали перекачиваются, исчезнувшие — вычищаются из
 * `apiCache` по тому же ключу, которым их читает `useSetlist`/`useSetlistPlayback`.
 */
export async function syncSetlistsDelta(
  manifestSetlists: Array<[string, string]>,
  storedVersions: Record<string, string>
): Promise<{ stats: DeltaStats; versions: Record<string, string> }> {
  const db = await getDB();
  const versions: Record<string, string> = { ...storedVersions };
  const stats: DeltaStats = { checked: manifestSetlists.length, updated: 0, removed: 0 };

  const manifestIds = new Set(manifestSetlists.map(([id]) => id));

  for (const [id, version] of manifestSetlists) {
    if (storedVersions[id] === version) continue;
    debug('delta: сет изменился', { id, from: storedVersions[id] ?? '—', to: version });
    const detail = await setlistsApi.getSetlist(id);
    await persistApiCache(setlistCacheKey(id), detail);
    versions[id] = version;
    stats.updated++;
  }

  for (const id of Object.keys(storedVersions)) {
    if (manifestIds.has(id)) continue;
    debug('delta: сет удалён на сервере', { id });
    await db.delete('apiCache', setlistCacheKey(id));
    delete versions[id];
    stats.removed++;
  }

  if (stats.updated > 0 || stats.removed > 0) {
    await persistApiCache(SETLISTS_LIST_CACHE_KEY, await setlistsApi.getSetlists());
  }

  return { stats, versions };
}
