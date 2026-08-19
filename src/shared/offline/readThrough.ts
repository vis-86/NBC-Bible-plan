import { getDB } from './db';
import { OfflineNoDataError, isDefinitelyOffline, raceNetwork } from './networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, isNetworkTimeout } from './networkTimeout';

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

/**
 * Ключ apiCache для списка песен. Живёт рядом с самим apiCache, потому что писатель
 * (`downloadManager.downloadSongs`) и читатель (`useSongs`) обязаны использовать один
 * и тот же ключ — разъехавшиеся строки уже роняли офлайн (см. patches/2026-07-10-16.46).
 */
export const SONGS_LIST_CACHE_KEY = 'songs:list';

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
    return await raceNetwork(network, timeoutMs);
  } catch (err) {
    const cached = await getApiCache<T>(key);
    if (cached !== undefined) {
      console.debug('[FIX][offline/readThrough] network failed/timed out, served from IDB apiCache', key, err);
      return cached;
    }
    if (isNetworkTimeout(err)) {
      // Ждать медленную сеть осмысленно; ждать ОТСУТСТВУЮЩУЮ — это вечный спиннер
      // без единой ошибки в консоли. Пустой кеш + заведомый офлайн = ждать нечего.
      if (isDefinitelyOffline()) {
        debug('offline with empty cache — не ждём сеть', key);
        throw new OfflineNoDataError();
      }
      debug('timeout with empty cache, waiting for slow network', key);
      return network;
    }
    throw err;
  }
}

/** Значение TTL по умолчанию для SWR-чтения: свежее моложе 5 минут — в сеть не идём вовсе. */
export const DEFAULT_SWR_TTL_MS = 5 * 60_000;

export interface ApiCacheRecord<T> {
  data: T;
  updatedAt: number;
}

/**
 * Как `getApiCache`, но отдаёт запись целиком (нужен `updatedAt` для TTL).
 * Отличать «записи нет» (`undefined`) от «в кеше лежит `[]`/`null`» обязательно —
 * пустой список является валидным закешированным ответом.
 */
export async function getApiCacheRecord<T>(key: string): Promise<ApiCacheRecord<T> | undefined> {
  try {
    const db = await getDB();
    const record = await db.get('apiCache', key);
    if (!record) return undefined;
    return { data: record.data as T, updatedAt: record.updatedAt };
  } catch (err) {
    debug('IDB read failed', key, err);
    return undefined;
  }
}

export interface ReadThroughSWROptions<T> {
  /** Возраст записи, при котором сеть не запрашивается вовсе. */
  ttlMs?: number;
  /** Таймаут сетевой гонки для ветки «кеша нет» (совпадает с `readThrough`). */
  timeoutMs?: number;
  /** Вызывается ТОЛЬКО когда фоновая ревалидация принесла данные (ветка «кеш протух»). */
  onFresh?: (data: T) => void;
}

export interface ReadThroughSWRResult<T> {
  data: T;
  /** Данные пришли из IDB (мгновенно), а не из сети. */
  fromCache: boolean;
  /** Запущена фоновая ревалидация — позже придёт `onFresh`. */
  revalidating: boolean;
}

/**
 * Cache-first (stale-while-revalidate) чтение. Три ветки:
 *  1. кеш свежий (моложе `ttlMs`) → отдаём мгновенно, сеть НЕ трогаем;
 *  2. кеш протух → отдаём мгновенно, сеть в фоне → `persistApiCache` + `onFresh`;
 *  3. кеша нет → полностью прежнее поведение `readThrough` (network-first, circuit
 *     breaker, `OfflineNoDataError`) — на холодном старте фолбэка нет и врать нечем.
 */
export async function readThroughSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: ReadThroughSWROptions<T> = {}
): Promise<ReadThroughSWRResult<T>> {
  const { ttlMs = DEFAULT_SWR_TTL_MS, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS, onFresh } = options;

  const record = await getApiCacheRecord<T>(key);

  if (record === undefined) {
    debug('cache miss → network-first', key);
    const data = await readThrough<T>(key, fetcher, timeoutMs);
    return { data, fromCache: false, revalidating: false };
  }

  const age = Date.now() - record.updatedAt;
  if (age < ttlMs) {
    debug('cache hit (fresh)', key, { ageMs: age, ttlMs });
    return { data: record.data, fromCache: true, revalidating: false };
  }

  debug('cache hit (stale) → background revalidate', key, { ageMs: age, ttlMs });
  if (isDefinitelyOffline()) {
    debug('offline — фоновая ревалидация пропущена', key);
    return { data: record.data, fromCache: true, revalidating: false };
  }

  const revalidation = fetcher()
    .then((fresh) => {
      void persistApiCache(key, fresh);
      const changed = JSON.stringify(fresh) !== JSON.stringify(record.data);
      debug('revalidated', key, { changed });
      onFresh?.(fresh);
    })
    .catch((err) => {
      // Офлайн/таймаут в фоне — ожидаемое состояние, а не ошибка экрана.
      debug('background revalidation failed', key, err);
    });
  // Промис намеренно не ожидается; `.catch` выше делает поздний reject безопасным.
  void revalidation;

  return { data: record.data, fromCache: true, revalidating: true };
}
