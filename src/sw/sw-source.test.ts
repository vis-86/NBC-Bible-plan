import { describe, expect, it, vi } from 'vitest';
import { routeStrategy, handleStaticAsset, handleNavigation, buildSwBody, pruneUnknownCaches, OFFLINE_FALLBACK_HTML } from './sw-source';

/**
 * Регрессия на баг из прода (авиарежим): `handleNavigation` раньше читал
 * `OFFLINE_FALLBACK_HTML` как module-level константу вместо параметра. Тело
 * функции сериализуется через `.toString()` и встраивается в генерируемый SW-текст
 * как есть — прод-минификация Next.js переименовывает такую свободную ссылку
 * (например, в однобуквенное `y`), а `buildSwBody()` объявляет константу заново под
 * ОРИГИНАЛЬНЫМ именем, так что минифицированное тело её не находит:
 * `FetchEvent.respondWith received an error: ReferenceError: Can't find variable: y`
 * — воспроизведено на реальном устройстве. Этот тест грубо гарантирует, что
 * сериализуемые функции не ссылаются на module-level константы по имени.
 */
describe('сериализуемые SW-функции не должны ссылаться на module-level константы', () => {
  const moduleLevelNames = ['SW_DISABLED', 'STATIC_CACHE_NAME', 'HTML_CACHE_NAME', 'OFFLINE_FALLBACK_HTML', 'NAV_TIMEOUT_MS'];

  it.each([
    ['routeStrategy', routeStrategy],
    ['handleStaticAsset', handleStaticAsset],
    ['handleNavigation', handleNavigation],
  ])('%s ссылается только на свои параметры', (_name, fn) => {
    const source = fn.toString();
    for (const identifier of moduleLevelNames) {
      expect(source).not.toContain(identifier);
    }
  });
});

/** Мок Cache API (match/put/keys) для тестов SW fetch-стратегий без реального браузера. */
class FakeCache {
  private store = new Map<string, Response>();

  async match(request: Request, options?: { ignoreSearch?: boolean }): Promise<Response | undefined> {
    if (options?.ignoreSearch) {
      const target = new URL(request.url);
      for (const [urlStr, res] of this.store) {
        const u = new URL(urlStr);
        if (u.origin === target.origin && u.pathname === target.pathname) return res;
      }
      return undefined;
    }
    return this.store.get(request.url);
  }

  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, response);
  }

  async keys(): Promise<Request[]> {
    return Array.from(this.store.keys()).map((url) => new Request(url));
  }
}

/**
 * Регрессия на mid-session capture: старая вкладка + новый SW, захвативший контроль
 * сразу на install, отдаёт lazy-чанки с новыми content-hash именами, которых старый
 * HTML не ждёт (ChunkLoadError). Новый SW обязан ждать в waiting до явной команды
 * SKIP_WAITING от клиента (см. ServiceWorkerRegistrar/UpdateToast).
 */
describe('buildSwBody', () => {
  it('install-обработчик не вызывает skipWaiting()', () => {
    const body = buildSwBody();
    const installBlock = body.slice(
      body.indexOf("addEventListener('install'"),
      body.indexOf("addEventListener('message'")
    );
    expect(installBlock).not.toContain('skipWaiting()');
  });

  it('содержит message-обработчик, вызывающий skipWaiting() на SKIP_WAITING', () => {
    const body = buildSwBody();
    const messageBlock = body.slice(
      body.indexOf("addEventListener('message'"),
      body.indexOf("addEventListener('activate'")
    );
    expect(messageBlock).toContain("event.data.type === 'SKIP_WAITING'");
    expect(messageBlock).toContain('skipWaiting()');
  });

  it('встраивает SW_BUILD из NEXT_PUBLIC_APP_BUILD_TIME', () => {
    const body = buildSwBody();
    expect(body).toContain('const SW_BUILD =');
  });

  it('activate-обработчик вызывает pruneUnknownCaches ДО clients.claim()', () => {
    const body = buildSwBody();
    const activateBlock = body.slice(body.indexOf("addEventListener('activate'"), body.indexOf("addEventListener('fetch'"));
    const pruneIdx = activateBlock.indexOf('pruneUnknownCaches(');
    const claimIdx = activateBlock.indexOf('clients.claim()');
    expect(pruneIdx).toBeGreaterThan(-1);
    expect(pruneIdx).toBeLessThan(claimIdx);
  });
});

describe('pruneUnknownCaches', () => {
  it('пустой список кешей -> нечего удалять', () => {
    expect(pruneUnknownCaches([], ['app-shell-static-v1', 'app-shell-html-v1'])).toEqual([]);
  });

  it('все кеши известны -> нечего удалять', () => {
    expect(
      pruneUnknownCaches(['app-shell-static-v1', 'app-shell-html-v1'], ['app-shell-static-v1', 'app-shell-html-v1'])
    ).toEqual([]);
  });

  it('смесь известных и чужих кешей -> возвращает только чужие', () => {
    expect(
      pruneUnknownCaches(
        ['app-shell-static-v1', 'workbox-precache-old', 'app-shell-html-v1', 'some-legacy-cache'],
        ['app-shell-static-v1', 'app-shell-html-v1']
      )
    ).toEqual(['workbox-precache-old', 'some-legacy-cache']);
  });
});

describe('routeStrategy', () => {
  it('cache-first для same-origin GET _next/static чанков', () => {
    expect(routeStrategy('/app/_next/static/chunks/main.js', 'GET', true, 'no-cors')).toBe('cache-first-static');
  });

  it('passthrough для non-GET (даже same-origin static-путь)', () => {
    expect(routeStrategy('/app/_next/static/chunks/main.js', 'POST', true, 'navigate')).toBe('passthrough');
  });

  it('passthrough для cross-origin запросов (напр. telegram.org)', () => {
    expect(routeStrategy('/js/telegram-web-app.js', 'GET', false, 'no-cors')).toBe('passthrough');
  });

  it('passthrough для любых /api/* маршрутов', () => {
    expect(routeStrategy('/app/api/bible/genesis/1', 'GET', true, 'cors')).toBe('passthrough');
  });

  it('passthrough для /api/* даже если путь также содержит _next/static (edge-case)', () => {
    expect(routeStrategy('/app/api/_next/static/weird', 'GET', true, 'cors')).toBe('passthrough');
  });

  it('network-first-html для настоящих HTML-навигаций (mode=navigate, корень)', () => {
    expect(routeStrategy('/app/', 'GET', true, 'navigate')).toBe('network-first-html');
  });

  it('network-first-html для настоящих HTML-навигаций (mode=navigate, ридер)', () => {
    // Approach C: ридер — один маршрут /dashboard/read, глава в search-параметрах.
    expect(routeStrategy('/app/dashboard/read', 'GET', true, 'navigate')).toBe('network-first-html');
  });

  it('passthrough для RSC/flight-фетчей клиентского router.push (mode!=navigate) — не HTML-навигация', () => {
    expect(routeStrategy('/app/dashboard/songs', 'GET', true, 'cors')).toBe('passthrough');
    expect(routeStrategy('/app/dashboard/songs', 'GET', true, 'same-origin')).toBe('passthrough');
  });
});

describe('handleStaticAsset', () => {
  it('при промахе кеша запрашивает сеть и кеширует успешный ответ', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/_next/static/chunks/main.js');
    const fetcher = vi.fn().mockResolvedValue(new Response('chunk-body', { status: 200 }));

    const res = await handleStaticAsset(cache, request, fetcher);

    expect(await res.text()).toBe('chunk-body');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await cache.match(request)).toBeDefined();
  });

  it('при попадании в кеш сеть не запрашивается', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/_next/static/chunks/main.js');
    await cache.put(request, new Response('cached-chunk'));
    const fetcher = vi.fn();

    const res = await handleStaticAsset(cache, request, fetcher);

    expect(await res.text()).toBe('cached-chunk');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

/** Достаточно большой, чтобы обычные resolve/reject-моки успевали раньше таймаута. */
const TEST_NAV_TIMEOUT_MS = 1000;

describe('handleNavigation', () => {
  it('успешная загрузка кеширует HTML-документ', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/app/dashboard');
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>dashboard</html>', { status: 200 }));

    const res = await handleNavigation(cache, request, fetcher, OFFLINE_FALLBACK_HTML, TEST_NAV_TIMEOUT_MS);

    expect(await res.text()).toBe('<html>dashboard</html>');
    expect(await cache.match(request)).toBeDefined();
  });

  it('офлайн + посещённая страница в кеше -> отдаёт РЕАЛЬНЫЙ HTML этой страницы, не заглушку', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/app/dashboard');
    await cache.put(request, new Response('<html>cached dashboard</html>'));
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await handleNavigation(cache, request, fetcher, OFFLINE_FALLBACK_HTML, TEST_NAV_TIMEOUT_MS);

    expect(res.status).not.toBe(503);
    expect(await res.text()).toBe('<html>cached dashboard</html>');
  });

  it('офлайн + страница НЕ посещалась, но другие страницы в кеше -> статическая офлайн-заглушка, НЕ чужой HTML (иначе reload-цикл в App Router)', async () => {
    const cache = new FakeCache();
    const visited = new Request('https://app.test/app/dashboard');
    await cache.put(visited, new Response('<html>app shell</html>'));
    const neverVisited = new Request('https://app.test/app/dashboard/songs/42');
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await handleNavigation(cache, neverVisited, fetcher, OFFLINE_FALLBACK_HTML, TEST_NAV_TIMEOUT_MS);

    // Регрессионный тест: раньше здесь подставлялся HTML другой закешированной
    // страницы ("тот же бандл, клиентский роутинг подхватит"). На практике
    // App Router встраивает в документ RSC-payload КОНКРЕТНОГО маршрута — при
    // расхождении с текущим URL гидратация уходит в бесконечный hard-reload
    // (воспроизведено вручную в браузере офлайн).
    const body = await res.text();
    expect(body).not.toBe('<html>app shell</html>');
    expect(body).toBe(OFFLINE_FALLBACK_HTML);
  });

  it('офлайн + ридер: закешированная глава отдаётся для ЛЮБОЙ другой главы через ignoreSearch (approach C)', async () => {
    // Ридер — один маршрут /dashboard/read?book=&chapter=. Один закешированный документ
    // должен обслуживать любую другую главу офлайн: pathname тот же, отличается только
    // search → безопасно (RSC-payload того же маршрута, без reload-цикла).
    const cache = new FakeCache();
    const visitedChapter = new Request('https://app.test/app/dashboard/read?book=%D0%91%D1%8B%D1%82%D0%B8%D0%B5&chapter=1');
    await cache.put(visitedChapter, new Response('<html>reader shell</html>'));
    const anotherChapter = new Request('https://app.test/app/dashboard/read?book=%D0%98%D1%81%D1%85%D0%BE%D0%B4&chapter=5');
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await handleNavigation(cache, anotherChapter, fetcher, OFFLINE_FALLBACK_HTML, TEST_NAV_TIMEOUT_MS);

    expect(res.status).not.toBe(503);
    expect(await res.text()).toBe('<html>reader shell</html>');
  });

  it('ignoreSearch не подставляет документ ДРУГОГО pathname (нет кросс-маршрутной подмены)', async () => {
    const cache = new FakeCache();
    await cache.put(
      new Request('https://app.test/app/dashboard/read?book=%D0%91%D1%8B%D1%82%D0%B8%D0%B5&chapter=1'),
      new Response('<html>reader shell</html>')
    );
    // Навигация на ДРУГОЙ маршрут без совпадения pathname → заглушка, не документ ридера.
    const otherRoute = new Request('https://app.test/app/dashboard/calendar?month=3');
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await handleNavigation(cache, otherRoute, fetcher, OFFLINE_FALLBACK_HTML, TEST_NAV_TIMEOUT_MS);

    expect(await res.text()).toBe(OFFLINE_FALLBACK_HTML);
  });

  it('офлайн + кеш пуст (самый первый визит без сети) -> статическая офлайн-заглушка', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/app/dashboard');
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await handleNavigation(cache, request, fetcher, OFFLINE_FALLBACK_HTML, TEST_NAV_TIMEOUT_MS);

    expect(res.status).toBe(503);
    expect(await res.text()).toBe(OFFLINE_FALLBACK_HTML);
  });

  it('ЗАВИСШАЯ сеть (реальный «офлайн» без reject) -> по таймауту отдаётся кеш, а не пустой экран', async () => {
    // Регрессионный тест: fetch в мёртвой соте/Wi-Fi без аплинка висит минутами, а не
    // падает — без таймаута кешированная страница не отдавалась вообще.
    const cache = new FakeCache();
    const request = new Request('https://app.test/app/dashboard');
    await cache.put(request, new Response('<html>cached dashboard</html>'));
    const fetcher = vi.fn(() => new Promise<Response>(() => {})); // висит вечно

    const res = await handleNavigation(cache, request, fetcher, OFFLINE_FALLBACK_HTML, 20);

    expect(await res.text()).toBe('<html>cached dashboard</html>');
  });

  it('ЗАВИСШАЯ сеть + кеш пуст -> дожидаемся сеть (медленная сеть лучше 503-заглушки)', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/app/dashboard');
    const fetcher = vi.fn(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response('<html>slow</html>', { status: 200 })), 60))
    );

    const res = await handleNavigation(cache, request, fetcher, OFFLINE_FALLBACK_HTML, 20);

    expect(await res.text()).toBe('<html>slow</html>');
  });

  it('redirected-ответ (протухшая сессия -> логин) НЕ кешируется под ключом маршрута', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/app/dashboard');
    const redirected = new Response('<html>login</html>', { status: 200 });
    Object.defineProperty(redirected, 'redirected', { value: true });
    const fetcher = vi.fn().mockResolvedValue(redirected);

    const res = await handleNavigation(cache, request, fetcher, OFFLINE_FALLBACK_HTML, TEST_NAV_TIMEOUT_MS);

    expect(await res.text()).toBe('<html>login</html>');
    // Иначе офлайн /dashboard вечно отдавал бы логин-страницу вместо приложения.
    expect(await cache.match(request)).toBeUndefined();
  });
});
