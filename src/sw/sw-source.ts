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

/** Собирает текст service worker'а. Вызывается только на сервере (route.ts). */
export function buildSwBody(): string {
  return `
'use strict';

const SW_DISABLED = ${SW_DISABLED};
const STATIC_CACHE_NAME = ${JSON.stringify(STATIC_CACHE_NAME)};
const routeStrategy = ${routeStrategy.toString()};

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
      (async () => {
        const cache = await caches.open(STATIC_CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  // network-first-html
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        console.debug('[SW] navigation offline, no cache for', url.pathname, err);
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
`;
}
