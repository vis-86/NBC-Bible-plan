/**
 * Статический app-shell service worker без build-шага (без @serwist/build).
 * Body реального SW собирается в `src/app/sw.js/route.ts` через `buildSwBody()` —
 * решение routing-логики сериализуется через `.toString()`, чтобы не дублировать
 * протестированную функцию `routeStrategy` вручную в plain-JS шаблоне.
 *
 * Precache-манифеста НЕТ (см. .ai-factory/plans/feature-offline-pwa.md): чанки
 * `_next/static/**` — content-hashed/immutable → cache-first безопасен без
 * инвалидации; HTML-навигации — NetworkFirst. Все `/api/*`, non-GET и cross-origin
 * запросы (в т.ч. telegram.org — hydration-фикс b4c2f01) идут passthrough
 * (без event.respondWith). RSC/flight-фетчи клиентского `router.push`
 * (mode !== 'navigate') — тоже passthrough, а не HTML-навигация (см. routeStrategy).
 */

export type SwRouteStrategy = 'cache-first-static' | 'network-first-html' | 'passthrough';

/**
 * Чистая функция без замыканий — тело сериализуется через `.toString()` и
 * встраивается в текст service worker'а как есть, поэтому не должна ссылаться
 * ни на что вне своих аргументов.
 */
export function routeStrategy(
  pathname: string,
  method: string,
  sameOrigin: boolean,
  mode: string
): SwRouteStrategy {
  if (method !== 'GET' || !sameOrigin) return 'passthrough';
  if (pathname.includes('/api/')) return 'passthrough';
  if (pathname.includes('/_next/static/')) return 'cache-first-static';
  // Next.js App Router client navigations (router.push) fetch RSC/flight data via a plain
  // fetch() (mode 'cors'/'same-origin'), not a real document navigation (mode 'navigate').
  // Those flight requests carry a cache-busting `_rsc=<hash>` query param that never repeats,
  // so caching/serving them like HTML documents pollutes the HTML cache and, offline, makes
  // Next.js treat the mismatched response as a failed navigation and force a hard reload —
  // which then hits this same fallback again. Only real document navigations get NetworkFirst.
  if (mode !== 'navigate') return 'passthrough';
  return 'network-first-html';
}

/** Kill switch: true → SW чистит caches и делает unregister() вместо обычной работы. */
export const SW_DISABLED = false;

const STATIC_CACHE_NAME = 'app-shell-static-v1';
/**
 * Экспортируется, чтобы downloadManager мог прогреть HTML app-shell тем же кешем,
 * из которого читает `handleNavigation` (единый источник имени кеша, без дубля строки).
 */
export const HTML_CACHE_NAME = 'app-shell-html-v1';

/**
 * Отдаётся офлайн для навигации на маршрут, у которого нет точного совпадения в
 * HTML_CACHE_NAME (страница ни разу не открывалась как настоящая документная
 * навигация в этой сессии). НЕЛЬЗЯ подставлять сюда HTML другой закешированной
 * страницы: в App Router документ несёт вшитый RSC-payload КОНКРЕТНОГO маршрута,
 * и при расхождении с текущим URL клиентская гидратация уходит в повторный
 * hard-reload — воспроизведено вручную (браузер зацикливается на reload).
 * Поэтому здесь — самостоятельная статика без Next.js-рантайма.
 */
export const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Нет соединения</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;background:#fafafa;color:#111}</style>
</head><body><div><p>Эта страница ещё не открывалась офлайн. Подключитесь к интернету, чтобы загрузить её, либо вернитесь на уже посещённую страницу.</p></div></body></html>`;

/** Cache API-подобный интерфейс — совпадает с настоящим `Cache`, но допускает мок в тестах. */
interface SwCacheLike {
  match(request: unknown, options?: { ignoreSearch?: boolean }): Promise<Response | undefined>;
  put(request: unknown, response: Response): Promise<void>;
  keys(): Promise<readonly unknown[]>;
}

/**
 * Чистая (кроме кеша) функция без внешних замыканий — сериализуется через `.toString()`.
 * cache-first: чанки `_next/static/**` immutable, инвалидация не нужна.
 */
export async function handleStaticAsset(
  cache: SwCacheLike,
  request: Request,
  fetcher: (request: Request) => Promise<Response>
): Promise<Response> {
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetcher(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/**
 * NetworkFirst для HTML-навигаций — сериализуется через `.toString()`.
 * Каждый успешно загруженный документ кешируется, поэтому повторный офлайн-визит
 * на ПОСЕЩЁННУЮ (реальной навигацией, не RSC-фетчем) страницу отдаёт её реальный
 * HTML — приложение догружается и дальше работает через клиентский IndexedDB
 * read-through слой. Если точного совпадения нет — страница ни разу не открывалась
 * как настоящая навигация в этой сессии — отдаём offlineFallbackHtml. Передаётся
 * ПАРАМЕТРОМ, а не читается как module-level константа: тело функции сериализуется
 * через `.toString()`, продакшн-минификация может переименовать свободную ссылку на
 * внешнюю константу, а сгенерированный SW-скрипт объявляет её под ОРИГИНАЛЬНЫМ
 * именем — рассинхрон даёт `ReferenceError: Can't find variable` прямо в проде
 * (воспроизведено на реальном устройстве в авиарежиме). Подставлять сюда HTML
 * ДРУГОЙ закешированной страницы тоже нельзя (см. комментарий OFFLINE_FALLBACK_HTML)
 * — это уводит App Router в бесконечный цикл hard-reload.
 */
export async function handleNavigation(
  cache: SwCacheLike,
  request: Request,
  fetcher: (request: Request) => Promise<Response>,
  offlineFallbackHtml: string
): Promise<Response> {
  try {
    const res = await fetcher(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    console.debug('[FIX][SW] navigation fetch failed, trying HTML cache', request.url);
    const cached = await cache.match(request);
    if (cached) {
      console.debug('[FIX][SW] served exact cached page', request.url);
      return cached;
    }

    // Фолбэк по совпадению БЕЗ query (approach C, FIX_PLAN). Ридер переехал на один
    // маршрут /dashboard/read?book=&chapter=: сегмент маршрута (pathname) один и тот
    // же для любой главы, отличается только search. Один закешированный документ
    // /dashboard/read?... обслуживает любую другую главу офлайн. Это БЕЗОПАСНО в
    // отличие от подстановки HTML другого маршрута: pathname совпадает → RSC-payload
    // тот же самый маршрут, гидратация не уходит в цикл hard-reload, а книга/глава
    // читаются клиентом из location.search + IndexedDB. ignoreSearch не может выдать
    // документ другого pathname, поэтому кросс-маршрутной подмены здесь нет.
    const cachedIgnoreSearch = await cache.match(request, { ignoreSearch: true });
    if (cachedIgnoreSearch) {
      console.debug('[FIX][SW] served cached page ignoring search params', request.url);
      return cachedIgnoreSearch;
    }

    console.debug('[FIX][SW] no cached page, returning static offline fallback for', request.url);
    return new Response(offlineFallbackHtml, {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

/** Собирает текст service worker'а. Вызывается только на сервере (route.ts). */
export function buildSwBody(): string {
  return `
'use strict';

const SW_DISABLED = ${SW_DISABLED};
const STATIC_CACHE_NAME = ${JSON.stringify(STATIC_CACHE_NAME)};
const HTML_CACHE_NAME = ${JSON.stringify(HTML_CACHE_NAME)};
const OFFLINE_FALLBACK_HTML = ${JSON.stringify(OFFLINE_FALLBACK_HTML)};
const routeStrategy = ${routeStrategy.toString()};
const handleStaticAsset = ${handleStaticAsset.toString()};
const handleNavigation = ${handleNavigation.toString()};

self.addEventListener('install', () => {
  self.skipWaiting();
  console.debug('[SW] installing');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (SW_DISABLED) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        await self.registration.unregister();
        console.debug('[SW] kill switch active — caches cleared, unregistered');
      }
      await self.clients.claim();
      console.debug('[SW] activated');
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (SW_DISABLED) return;

  const req = event.request;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const strategy = routeStrategy(url.pathname, req.method, sameOrigin, req.mode);

  if (strategy === 'passthrough') return;

  if (strategy === 'cache-first-static') {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then((cache) => handleStaticAsset(cache, req, fetch))
    );
    return;
  }

  // network-first-html
  event.respondWith(
    caches.open(HTML_CACHE_NAME).then((cache) => handleNavigation(cache, req, fetch, OFFLINE_FALLBACK_HTML))
  );
});
`;
}
