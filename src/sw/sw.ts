/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Build-time service worker с precache-манифестом (Serwist `injectManifest`, см.
 * `scripts/build-sw.ts`). Заменяет прежний `src/sw/sw-source.ts` (`.toString()`-
 * сериализация + `src/app/sw.js/route.ts`) — тот подход был нужен только пока SW не
 * проходил через реальный build-шаг. Теперь это обычный TS-модуль, бандлится
 * esbuild'ом, поэтому замыкания на module-level константы разрешены.
 *
 * Модель: атомарный снимок ВСЕХ статических файлов `out/` (HTML, JS, CSS, RSC/flight
 * `.txt`-пейлоады export'а) кешируется целиком на `install`. Навигации — cache-first
 * из precache по мэппингу `pathname -> pathname + '.html'` (`{basePath}/` -> `index.html`).
 * Сеть на навигациях не нужна: обновление приезжает через отдельный SW update flow
 * (`ServiceWorkerRegistrar` + `useSwUpdate`), не через network-first здесь.
 */

interface PrecacheEntry {
  url: string;
  revision: string | null;
}

/** Подставляются `define`'ом esbuild'а в `scripts/build-sw.ts`. */
declare const __BASE_PATH__: string;
declare const __SW_BUILD__: string;

/** Kill switch: true → SW чистит caches и делает unregister() вместо обычной работы. */
export const SW_DISABLED = false;

/**
 * Отдаётся офлайн для навигации на маршрут без точного совпадения в precache (не
 * входит в export — опечатка/устаревшая ссылка). НЕЛЬЗЯ подставлять сюда HTML другого
 * закешированного маршрута: документ App Router несёт вшитый RSC-payload КОНКРЕТНОГО
 * маршрута, расхождение с текущим URL уводит гидратацию в цикл hard-reload
 * (воспроизведено вручную на устройстве в прежней runtime-кеш модели).
 */
export const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Нет соединения</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;background:#fafafa;color:#111}</style>
</head><body><div><p>Эта страница ещё не открывалась офлайн. Подключитесь к интернету, чтобы загрузить её, либо вернитесь на уже посещённую страницу.</p></div></body></html>`;

export type SwRouteStrategy = 'passthrough' | 'precache-static' | 'precache-navigation';

/**
 * `_next/static/**`, RSC/flight `.txt`-пейлоады export'а и прочие same-origin GET —
 * всё это статика прекеша (cache-first, сетевой фолбэк при промахе). Только реальные
 * document-навигации (`mode === 'navigate'`) идут отдельной веткой с html-мэппингом.
 */
export function routeStrategy(pathname: string, method: string, sameOrigin: boolean, mode: string): SwRouteStrategy {
  if (method !== 'GET' || !sameOrigin) return 'passthrough';
  if (pathname.includes('/api/')) return 'passthrough';
  if (mode === 'navigate') return 'precache-navigation';
  return 'precache-static';
}

/**
 * Export кладёt страницы как `dashboard.html` — навигация на `{basePath}/dashboard`
 * должна резолвиться в precache-ключ `{basePath}/dashboard.html`; корень —
 * `{basePath}/index.html`. Query игнорируется (ключ строится только из pathname) —
 * это и есть ignoreSearch: один документ маршрута обслуживает любые search-параметры
 * (ридер — `?book=&chapter=`, песня — `?id=`).
 */
export function pathnameToHtmlKey(pathname: string, basePath: string): string {
  if (pathname === basePath || pathname === `${basePath}/`) return `${basePath}/index.html`;
  return `${pathname}.html`;
}

/**
 * `injectManifest` пишет `entry.url` БЕЗ ведущего слэша (`"dashboard.html"`,
 * `"dashboard/calendar.html"`) — реальный же запрос идёт с basePath и слэшем
 * (`/app/dashboard.html`). Собирает фактический URL, под которым кладём/ищем запись
 * в precache-кеше — используется и на install (запись), и совпадает с ключом из
 * `pathnameToHtmlKey` (чтение), поэтому оба места держат один источник формата.
 */
export function toPrecacheRequestUrl(basePath: string, entryUrl: string): string {
  return `${basePath}/${entryUrl}`;
}

/** Возвращает имена кешей, которых нет в known-списке (мусор от прежних версий SW). */
export function pruneUnknownCaches(cacheKeys: readonly string[], knownNames: readonly string[]): string[] {
  return cacheKeys.filter((key) => !knownNames.includes(key));
}

/** Минимальный срез Cache API, которого достаточно для чтения прекеша — упрощает моки в тестах. */
export interface PrecacheReader {
  match(key: string): Promise<Response | undefined>;
}

/** Cache-first по точному ключу `{basePath}/{pathname}.html`; промах → статическая офлайн-заглушка. */
export async function respondToNavigation(
  cache: PrecacheReader,
  pathname: string,
  basePath: string,
  offlineFallbackHtml: string
): Promise<Response> {
  const cached = await cache.match(pathnameToHtmlKey(pathname, basePath));
  if (cached) return cached;
  return new Response(offlineFallbackHtml, {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * Ключи для поиска в precache, по порядку: точный URL запроса, затем URL без query.
 *
 * Записи прекеша кладутся из `out/` без query (`toPrecacheRequestUrl`), а клиентская
 * навигация App Router в export-режиме запрашивает не документ, а RSC/flight-пейлоад:
 * `.txt` + cache-busting `_rsc=<hash>`, уникальный на каждый переход
 * (`/app/dashboard/read.txt?book=john&_rsc=1a2b`). Точный ключ не совпадёт никогда,
 * поэтому нужен второй проход без query. Для статики export'а query не участвует в
 * выборе файла — тот же принцип, что уже узаконен для навигаций в `pathnameToHtmlKey`.
 *
 * Ограничение: появится ассет, который различается по query, — поиск отдаст не тот файл.
 * В `out/` таких нет, `/api/*` сюда не попадает (`routeStrategy` → `passthrough`).
 *
 * Отдельная чистая функция, а не `cache.match(url, { ignoreSearch: true })`: тестируется
 * без Cache API и не зависит от того, реализует ли мок опции `match`.
 */
export function precacheLookupKeys(requestUrl: string): string[] {
  const withoutQuery = requestUrl.split('?')[0];
  return withoutQuery === requestUrl ? [requestUrl] : [requestUrl, withoutQuery];
}

/** Cache-first по ключам `precacheLookupKeys`; промах по всем (файл вне манифеста) → сеть. */
export async function respondToStaticAsset(
  cache: PrecacheReader,
  requestUrl: string,
  fetcher: () => Promise<Response>
): Promise<Response> {
  for (const key of precacheLookupKeys(requestUrl)) {
    const cached = await cache.match(key);
    if (cached) {
      console.debug('[SW][FIX] precache hit', key);
      return cached;
    }
  }
  console.debug('[SW][FIX] precache miss -> network', requestUrl);
  return fetcher();
}

// Инжектится `injectManifest` (`scripts/build-sw.ts`) — строка ниже ищется буквально,
// поэтому переменная должна называться ровно так и присваивание быть однострочным.
declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: PrecacheEntry[] };

/**
 * Guard на `typeof self` — файл импортируется тестами (`sw.test.ts`) напрямую ради
 * чистых функций выше; в Node/vitest окружении `self`/`caches`/`addEventListener`
 * не существуют, и без guard'а импорт падал бы на месте регистрации обработчиков.
 */
if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  const manifestEntries: PrecacheEntry[] = self.__SW_MANIFEST;
  const BASE_PATH = __BASE_PATH__;
  const SW_BUILD = __SW_BUILD__;
  const PRECACHE_NAME = `app-shell-precache-${SW_BUILD}`;

  self.addEventListener('install', (event) => {
    console.debug(`[SW] installing (build ${SW_BUILD}), ${manifestEntries.length} precache entries`);
    event.waitUntil(
      (async () => {
        const cache = await caches.open(PRECACHE_NAME);
        let cached = 0;
        await Promise.all(
          manifestEntries.map(async (entry) => {
            const requestUrl = toPrecacheRequestUrl(BASE_PATH, entry.url);
            try {
              const res = await fetch(requestUrl, { cache: 'reload' });
              if (!res.ok) {
                console.debug('[SW] precache skip (non-ok)', requestUrl, res.status);
                return;
              }
              await cache.put(requestUrl, res);
              cached += 1;
            } catch (err) {
              console.debug('[SW] precache failed', requestUrl, err);
            }
          })
        );
        console.debug(`[SW] precached ${cached}/${manifestEntries.length} entries (build ${SW_BUILD})`);
      })()
    );
  });

  // Намеренно не форсируем немедленную активацию здесь: новый SW должен ждать в
  // waiting-состоянии, пока пользователь явно не подтвердит обновление (см.
  // ServiceWorkerRegistrar/UpdateToast) — иначе mid-session захват старой вкладки
  // новым SW ломает lazy-чанки.
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      console.debug('[SW] SKIP_WAITING received');
      self.skipWaiting();
    }
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        if (SW_DISABLED) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
          await self.registration.unregister();
          console.debug('[SW] kill switch active — caches cleared, unregistered');
        } else {
          const staleCaches = pruneUnknownCaches(await caches.keys(), [PRECACHE_NAME]);
          if (staleCaches.length > 0) {
            await Promise.all(staleCaches.map((key) => caches.delete(key)));
            console.debug(`[SW] pruned stale caches: ${staleCaches.join(', ')}`);
          }
        }
        await self.clients.claim();
        console.debug(`[SW] activated (build ${SW_BUILD})`);
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

    const cache = caches.open(PRECACHE_NAME);

    if (strategy === 'precache-navigation') {
      event.respondWith(cache.then((c) => respondToNavigation(c, url.pathname, BASE_PATH, OFFLINE_FALLBACK_HTML)));
      return;
    }

    event.respondWith(cache.then((c) => respondToStaticAsset(c, req.url, () => fetch(req))));
  });
}
