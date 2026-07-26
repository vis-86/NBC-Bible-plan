import { getBasePath } from '@/shared/utils/api';

/**
 * Прогрев app-shell документов клиентских маршрутов в отдельный runtime-кеш.
 *
 * С T8 (build-time Serwist precache, `src/sw/sw.ts`) весь конечный набор HTML-документов
 * export'а уже атомарно кешируется при установке SW — этот прогрев для ТЕХ ЖЕ маршрутов
 * избыточен. Не удалено намеренно (план T8, раздел T13): оставлено до зелёных offline
 * E2E под новую топологию, дальше — упростить/удалить вместе с warmAppShellOnceOnline.
 * `HTML_CACHE_NAME` больше НЕ читается новым SW (тот использует свой версионированный
 * `app-shell-precache-*`) — эти записи сейчас мёртвый вес, а не часть офлайн-контракта.
 */
const HTML_CACHE_NAME = 'app-shell-html-v1';

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[offline/appShell]', ...args);
}

const APP_SHELL_ROUTES = [
  '/dashboard',
  '/dashboard/read?book=%D0%91%D1%8B%D1%82%D0%B8%D0%B5&chapter=1',
  '/dashboard/songs',
  '/dashboard/song',
  '/dashboard/calendar',
  '/dashboard/settings',
  '/dashboard/setlists',
  '/dashboard/setlist',
  '/dashboard/setlist-edit',
];

/** Прогрев уже запускался в этой сессии страницы — не долбим сеть на каждый рендер. */
let warmedThisSession = false;

/**
 * Прогревает документы конечного набора app-shell маршрутов в HTML-кеш SW. Вызывать
 * ТОЛЬКО в аутентифицированном онлайн-контексте (иначе `/dashboard/*` редиректит на
 * логин и мы закешируем логин-страницу как документ маршрута). Не-фатально по каждому
 * маршруту.
 */
export async function warmAppShell(): Promise<void> {
  if (typeof caches === 'undefined') {
    debug('Cache API unavailable, skipping app-shell warm-up');
    return;
  }
  let cache: Cache;
  try {
    cache = await caches.open(HTML_CACHE_NAME);
  } catch (err) {
    debug('cannot open HTML cache', err);
    return;
  }
  const base = getBasePath();
  await Promise.allSettled(
    APP_SHELL_ROUTES.map(async (route) => {
      const url = `${base}${route}`;
      try {
        const res = await fetch(url, { credentials: 'include', headers: { Accept: 'text/html' } });
        // Только успешный HTML-документ. Редирект на логин/ошибку в кеш не кладём —
        // иначе офлайн получим логин-страницу вместо маршрута.
        const isHtml = (res.headers.get('content-type') || '').includes('text/html');
        if (!res.ok || res.redirected || !isHtml) {
          debug('skipped', url, res.status, res.redirected);
          return;
        }
        await cache.put(url, res.clone());
        debug('warmed route', url);
      } catch (err) {
        debug('warm failed for', url, err);
      }
    })
  );
}

/**
 * Идемпотентный прогрев на онлайн-загрузке приложения: один раз за сессию страницы и
 * только при наличии сети. Само-лечится после каждого деплоя — первый онлайн-визит
 * заново кладёт актуальные документы (с новыми хешами чанков) в HTML-кеш.
 */
export async function warmAppShellOnceOnline(): Promise<void> {
  if (warmedThisSession) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  warmedThisSession = true;
  // Просим не выселять Cache Storage: iOS/Safari агрессивно чистит несохранённый кеш
  // между сессиями standalone-PWA — это одна из причин белого экрана при переоткрытии
  // офлайн. Раньше persist() дёргался только при «скачать всё»; теперь — на каждом
  // онлайн-старте. Безопасно и без промпта.
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* не критично */
  }
  await warmAppShell();
}
