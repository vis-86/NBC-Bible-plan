import { HTML_CACHE_NAME } from '@/sw/sw-source';
import { getBasePath } from '@/shared/utils/api';

/**
 * Прогрев app-shell документов клиентских маршрутов в HTML-кеш SW.
 *
 * Корень проблемы: клиентская навигация App Router (`router.push`) офлайн делает
 * RSC-flight fetch (passthrough) → падает → Next откатывается на hard-навигацию
 * документа → `handleNavigation` не находит документ маршрута в HTML-кеше (его кладут
 * только реальные навигации, а не client push) → 503-заглушка. «Скачать всё» наполняет
 * IDB данными, но документы маршрутов в HTML-кеш не кладёт. Прогрев закрывает этот слой.
 *
 * Динамические маршруты (`read`, `song`) схлопнуты в query (approach C): один документ
 * + `ignoreSearch` в SW обслуживает любые значения, поэтому набор конечный.
 *
 * Вынесено в отдельный модуль (не в downloadManager), чтобы прогрев на каждой странице
 * дашборда не тянул в бандл idb/sync/endpoints.
 */

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
