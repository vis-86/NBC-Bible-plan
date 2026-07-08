/**
 * Auto-reload-once guard для ChunkLoadError: деплой при открытой вкладке меняет
 * content-hash имена `_next/static/**` чанков — старый HTML пытается динамически
 * догрузить чанк, которого на сервере уже нет, и падает в белый экран. Единственное
 * надёжное лечение на клиенте — reload (подтягивает новый HTML с актуальными
 * ссылками); T1–T3 (SW update flow) закрывают частый случай, но не гонку внутри
 * одной вкладки между запросом чанка и деплоем.
 */

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[ChunkGuard]', ...args);
}
function warn(...args: unknown[]) {
  if (DEBUG) console.warn('[ChunkGuard]', ...args);
}

const RELOAD_TS_KEY = 'chunk-guard-reload-ts';
const COOLDOWN_MS = 60_000;

const CHUNK_FAILURE_SUBSTRINGS = [
  'Loading chunk',
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'Loading CSS chunk',
];

/** Матчит и Error(-подобные объекты), и голые строки (unhandledrejection.reason бывает строкой). */
export function isChunkLoadFailure(err: unknown): boolean {
  if (err == null) return false;

  if (typeof err === 'object' && 'name' in err && (err as { name?: unknown }).name === 'ChunkLoadError') {
    return true;
  }

  const message =
    typeof err === 'string'
      ? err
      : typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : '';

  return CHUNK_FAILURE_SUBSTRINGS.some((substr) => message.includes(substr));
}

/** true если ещё не перезагружались, либо прошлый reload был дальше cooldownMs назад. */
export function shouldReload(now: number, lastReloadTs: number | null, cooldownMs: number): boolean {
  return lastReloadTs == null || now - lastReloadTs > cooldownMs;
}

function readLastReloadTs(): number | null {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_TS_KEY);
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writeLastReloadTs(ts: number): void {
  try {
    window.sessionStorage.setItem(RELOAD_TS_KEY, String(ts));
  } catch {
    // sessionStorage недоступен (private mode) — cooldown просто не сработает,
    // не критично: худший случай — лишний reload вместо отсутствия.
  }
}

function handlePotentialChunkFailure(err: unknown): void {
  if (!isChunkLoadFailure(err)) return;

  warn('chunk load failure detected', err);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    debug('offline — skip reload');
    return;
  }

  const now = Date.now();
  if (!shouldReload(now, readLastReloadTs(), COOLDOWN_MS)) {
    debug('cooldown active — not reloading');
    return;
  }

  writeLastReloadTs(now);
  debug('reloading page (once per cooldown)');
  window.location.reload();
}

/** Подписывается на глобальные error/unhandledrejection события. Возвращает функцию отписки. */
export function installChunkGuard(): () => void {
  const onError = (event: ErrorEvent) => handlePotentialChunkFailure(event.error ?? event.message);
  const onUnhandledRejection = (event: PromiseRejectionEvent) => handlePotentialChunkFailure(event.reason);

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
