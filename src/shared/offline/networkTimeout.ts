/**
 * Таймаут-обёртка для network-first путей офлайн-слоя.
 *
 * Корень бага «офлайн: пустой экран → вечная загрузка»: в авиарежиме/DevTools fetch
 * падает мгновенно, но в реальном «офлайне» (сеть есть, интернета нет: мёртвая сота,
 * Wi-Fi без аплинка, captive portal, VPN-дыра) запросы ВИСЯТ минутами. Все
 * network-first пути (SW-навигация, auth-сессия, read-through) ждали сеть
 * неограниченно — фолбэк на кеш/IDB просто не наступал.
 *
 * Паттерн использования: race сети с таймаутом; по таймауту пробуем фолбэк
 * (кеш/IDB); если фолбэка нет — ДОЖИДАЕМСЯ исходный запрос (медленная сеть лучше
 * ошибки, когда отдать больше нечего).
 */

/** Дефолт для клиентских data-путей (read-through, auth). SW держит свой инлайн-таймаут. */
export const DEFAULT_NETWORK_TIMEOUT_MS = 6000;

export class NetworkTimeoutError extends Error {
  constructor(ms: number) {
    super(`network request timed out after ${ms}ms`);
    this.name = 'NetworkTimeoutError';
  }
}

export function isNetworkTimeout(err: unknown): err is NetworkTimeoutError {
  return err instanceof NetworkTimeoutError;
}

/**
 * Promise.race исходного promise с таймаутом. По истечении отклоняется
 * NetworkTimeoutError; исходный promise НЕ отменяется — caller может дождаться
 * его позже (паттерн «нет фолбэка — ждём сеть»).
 */
export async function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new NetworkTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
