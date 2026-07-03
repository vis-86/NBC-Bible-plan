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
 * (без event.respondWith).
 */

export type SwRouteStrategy = 'cache-first-static' | 'network-first-html' | 'passthrough';

/**
 * Чистая функция без замыканий — тело сериализуется через `.toString()` и
 * встраивается в текст service worker'а как есть, поэтому не должна ссылаться
 * ни на что вне своих аргументов.
 */
export function routeStrategy(pathname: string, method: string, sameOrigin: boolean): SwRouteStrategy {
  if (method !== 'GET' || !sameOrigin) return 'passthrough';
  if (pathname.includes('/api/')) return 'passthrough';
  if (pathname.includes('/_next/static/')) return 'cache-first-static';
  return 'network-first-html';
}

/** Kill switch: true → SW чистит caches и делает unregister() вместо обычной работы. */
export const SW_DISABLED = false;

const STATIC_CACHE_NAME = 'app-shell-static-v1';
const HTML_CACHE_NAME = 'app-shell-html-v1';

/** Cache API-подобный интерфейс — совпадает с настоящим `Cache`, но допускает мок в тестах. */
interface SwCacheLike {
  match(request: unknown): Promise<Response | undefined>;
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
 * на ПОСЕЩЁННУЮ страницу отдаёт её реальный HTML (а не заглушку) — приложение
 * догружается и дальше работает через клиентский IndexedDB read-through слой.
 * Если точного совпадения нет (страница не посещалась) — отдаём любую другую
 * закешированную страницу как app-shell (тот же бандл, клиентский роутинг подхватит),
 * и только если кеш вообще пуст — самый первый офлайн-визит без единой посещённой
 * страницы — bare-текст "Offline".
 */
export async function handleNavigation(
  cache: SwCacheLike,
  request: Request,
  fetcher: (request: Request) => Promise<Response>
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

    const keys = await cache.keys();
    if (keys.length > 0) {
      const fallback = await cache.match(keys[0]);
      if (fallback) {
        console.debug('[FIX][SW] no exact match, served fallback cached page for', request.url);
        return fallback;
      }
    }

    console.debug('[FIX][SW] HTML cache empty, returning bare offline response for', request.url);
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/** Собирает текст service worker'а. Вызывается только на сервере (route.ts). */
export function buildSwBody(): string {
  return `
'use strict';

const SW_DISABLED = ${SW_DISABLED};
const STATIC_CACHE_NAME = ${JSON.stringify(STATIC_CACHE_NAME)};
const HTML_CACHE_NAME = ${JSON.stringify(HTML_CACHE_NAME)};
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
  const strategy = routeStrategy(url.pathname, req.method, sameOrigin);

  if (strategy === 'passthrough') return;

  if (strategy === 'cache-first-static') {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then((cache) => handleStaticAsset(cache, req, fetch))
    );
    return;
  }

  // network-first-html
  event.respondWith(
    caches.open(HTML_CACHE_NAME).then((cache) => handleNavigation(cache, req, fetch))
  );
});
`;
}
