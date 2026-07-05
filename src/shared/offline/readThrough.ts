import { getDB } from './db';
import { DEFAULT_NETWORK_TIMEOUT_MS, isNetworkTimeout, raceWithTimeout } from './networkTimeout';

/**
 * Network-first + IDB-фолбэк для GET-данных (songs/plan/weekly/books/settings —
 * Task 31, .ai-factory/plans/feature-offline-pwa.md). Единый паттерн: успешный
 * сетевой ответ пишется в IDB `apiCache` по логическому ключу; при сетевой ошибке
 * ИЛИ таймауте (реальный «офлайн» часто виснет, а не падает — см. networkTimeout.ts) —
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
 * При ошибке сети ИЛИ таймауте (`timeoutMs`, дефолт 6s) пытается отдать последний
 * закешированный результат под тем же ключом. Если в кеше пусто: сетевую ошибку
 * пробрасываем, а таймаут — дожидаемся исходный запрос (медленная сеть лучше ошибки,
 * когда фолбэка нет).
 */
export async function readThrough<T>(
  key: string,
  fetcher: () => Promise<T>,
  timeoutMs: number = DEFAULT_NETWORK_TIMEOUT_MS
): Promise<T> {
  const network = fetcher().then((data) => {
    void persistApiCache(key, data);
    return data;
  });
  // Если уйдём в кеш по таймауту, поздний reject сети не должен стать unhandled rejection.
  network.catch(() => {});

  try {
    return await raceWithTimeout(network, timeoutMs);
  } catch (err) {
    const cached = await getApiCache<T>(key);
    if (cached !== undefined) {
      console.debug('[FIX][offline/readThrough] network failed/timed out, served from IDB apiCache', key, err);
      return cached;
    }
    if (isNetworkTimeout(err)) {
      debug('timeout with empty cache, waiting for slow network', key);
      return network;
    }
    throw err;
  }
}
