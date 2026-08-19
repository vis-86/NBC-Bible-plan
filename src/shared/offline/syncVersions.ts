import { getDB } from './db';

/**
 * Версии офлайн-ресурсов, сохранённые последним успешным дельта-синком, и ETag манифеста.
 *
 * Живут в СУЩЕСТВУЮЩЕМ сторе `meta` — сознательно без новых сторов и без подъёма
 * `DB_VERSION`: миграция офлайн-схемы здесь самый дорогой риск (снос стора = потеря
 * скачанного Писания у тех, кто уже поставил PWA). Две записи в `meta` дают ровно то же.
 */

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[offline/syncVersions]', ...args);
}

/** Ключи `meta` — единственный источник, импортируемый и писателем, и читателем. */
export const SYNC_VERSIONS_META_KEY = 'sync:versions';
export const SYNC_ETAG_META_KEY = 'sync:etag';

export interface StoredSyncVersions {
  /** `songId` → версия, применённая локально. */
  songs: Record<string, string>;
  /** `setlistId` → версия, применённая локально. */
  setlists: Record<string, string>;
  plan: string | null;
}

const EMPTY: StoredSyncVersions = { songs: {}, setlists: {}, plan: null };

export async function getSyncVersions(): Promise<StoredSyncVersions> {
  try {
    const db = await getDB();
    const record = await db.get('meta', SYNC_VERSIONS_META_KEY);
    const value = record?.value as StoredSyncVersions | undefined;
    if (!value) {
      debug('карта версий пуста (первый запуск после обновления)');
      return { ...EMPTY };
    }
    const stored: StoredSyncVersions = {
      songs: value.songs ?? {},
      setlists: value.setlists ?? {},
      plan: value.plan ?? null,
    };
    debug('прочитана карта версий', {
      songs: Object.keys(stored.songs).length,
      setlists: Object.keys(stored.setlists).length,
    });
    return stored;
  } catch (err) {
    debug('чтение карты версий не удалось', err);
    return { ...EMPTY };
  }
}

export async function saveSyncVersions(versions: StoredSyncVersions): Promise<void> {
  try {
    const db = await getDB();
    await db.put('meta', { key: SYNC_VERSIONS_META_KEY, value: versions });
    debug('записана карта версий', {
      songs: Object.keys(versions.songs).length,
      setlists: Object.keys(versions.setlists).length,
    });
  } catch (err) {
    debug('запись карты версий не удалась', err);
  }
}

export async function getSyncEtag(): Promise<string | null> {
  try {
    const db = await getDB();
    const record = await db.get('meta', SYNC_ETAG_META_KEY);
    const etag = (record?.value as string | undefined) ?? null;
    debug('прочитан ETag', etag ?? '—');
    return etag;
  } catch (err) {
    debug('чтение ETag не удалось', err);
    return null;
  }
}

export async function saveSyncEtag(etag: string | null): Promise<void> {
  try {
    const db = await getDB();
    await db.put('meta', { key: SYNC_ETAG_META_KEY, value: etag });
    debug('записан ETag', etag ?? '—');
  } catch (err) {
    debug('запись ETag не удалась', err);
  }
}
