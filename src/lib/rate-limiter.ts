/**
 * Простой in-memory rate limiter. Подходит для single-server standalone-деплоя
 * (один процесс Next.js за nginx). Для горизонтального масштабирования — заменить
 * на Redis/иное общее хранилище.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[rate-limiter]', ...args);
}

/**
 * Проверяет лимит для ключа.
 * @param key уникальный ключ (например `login:${ip}`)
 * @param limit максимум запросов в окне
 * @param windowMs длительность окна в миллисекундах
 * @returns true — запрос разрешён, false — лимит превышен
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    debug('new window', key);
    return true;
  }

  if (entry.count >= limit) {
    debug('limit exceeded', key, entry.count);
    return false;
  }

  entry.count++;
  return true;
}

/** Возвращает заголовки X-RateLimit-* для ответа. */
export function rateLimitHeaders(key: string, limit: number): Record<string, string> {
  const entry = store.get(key);
  const remaining = entry ? Math.max(0, limit - entry.count) : limit;
  const reset = entry ? Math.ceil(entry.resetAt / 1000) : 0;
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  };
}

/** Извлекает клиентский IP из заголовков прокси. */
export function clientIp(request: { headers: { get(name: string): string | null } }): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/** Только для тестов: очистить хранилище. */
export function __resetRateLimitStore(): void {
  store.clear();
}
