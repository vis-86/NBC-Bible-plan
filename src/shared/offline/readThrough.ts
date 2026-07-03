import { getDB } from './db';

/**
 * Network-first + IDB-фолбэк для GET-данных (songs/plan/weekly/books/settings —
 * Task 31, .ai-factory/plans/feature-offline-pwa.md). Единый паттерн: успешный
 * сетевой ответ пишется в IDB `apiCache` по логическому ключу; при сетевой ошибке —
 * чтение последнего сохранённого ответа из IDB.
 */

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[offline/readThrough]', ...args);
}

export async function getApiCache<T>(key: string): Promise<T | undefined> {
  try {
    const db = await getDB();
    const record = await db.get('apiCache', key);
    return record?.data as T | undefined;
  } catch (err) {
    debug('IDB read failed', key, err);
    return undefined;
  }
}

export async function persistApiCache(key: string, data: unknown): Promise<void> {
  try {
    const db = await getDB();
    await db.put('apiCache', { key, data, updatedAt: Date.now() });
  } catch (err) {
    debug('IDB write failed', key, err);
  }
}

/**
 * Выполняет `fetcher`; при успехе кеширует результат в IDB под `key` и возвращает его.
 * При ошибке сети пытается отдать последний закешированный результат под тем же
 * ключом; если в кеше пусто — пробрасывает исходную ошибку.
 */
export async function readThrough<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const data = await fetcher();
    void persistApiCache(key, data);
    return data;
  } catch (err) {
    const cached = await getApiCache<T>(key);
    if (cached !== undefined) {
      debug('network failed, served from IDB apiCache', key, err);
      return cached;
    }
    throw err;
  }
}
