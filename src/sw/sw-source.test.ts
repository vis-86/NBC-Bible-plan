import { describe, expect, it, vi } from 'vitest';
import { routeStrategy, handleStaticAsset, handleNavigation } from './sw-source';

/** Мок Cache API (match/put/keys) для тестов SW fetch-стратегий без реального браузера. */
class FakeCache {
  private store = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.store.get(request.url);
  }

  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, response);
  }

  async keys(): Promise<Request[]> {
    return Array.from(this.store.keys()).map((url) => new Request(url));
  }
}

describe('routeStrategy', () => {
  it('cache-first для same-origin GET _next/static чанков', () => {
    expect(routeStrategy('/app/_next/static/chunks/main.js', 'GET', true)).toBe('cache-first-static');
  });

  it('passthrough для non-GET (даже same-origin static-путь)', () => {
    expect(routeStrategy('/app/_next/static/chunks/main.js', 'POST', true)).toBe('passthrough');
  });

  it('passthrough для cross-origin запросов (напр. telegram.org)', () => {
    expect(routeStrategy('/js/telegram-web-app.js', 'GET', false)).toBe('passthrough');
  });

  it('passthrough для любых /api/* маршрутов', () => {
    expect(routeStrategy('/app/api/bible/genesis/1', 'GET', true)).toBe('passthrough');
  });

  it('passthrough для /api/* даже если путь также содержит _next/static (edge-case)', () => {
    expect(routeStrategy('/app/api/_next/static/weird', 'GET', true)).toBe('passthrough');
  });

  it('network-first-html для HTML-навигаций (корень)', () => {
    expect(routeStrategy('/app/', 'GET', true)).toBe('network-first-html');
  });

  it('network-first-html для HTML-навигаций (dashboard)', () => {
    expect(routeStrategy('/app/dashboard/read/genesis/1', 'GET', true)).toBe('network-first-html');
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

describe('handleNavigation', () => {
  it('успешная загрузка кеширует HTML-документ', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/app/dashboard');
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>dashboard</html>', { status: 200 }));

    const res = await handleNavigation(cache, request, fetcher);

    expect(await res.text()).toBe('<html>dashboard</html>');
    expect(await cache.match(request)).toBeDefined();
  });

  it('офлайн + посещённая страница в кеше -> отдаёт РЕАЛЬНЫЙ HTML этой страницы, не заглушку', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/app/dashboard');
    await cache.put(request, new Response('<html>cached dashboard</html>'));
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await handleNavigation(cache, request, fetcher);

    expect(res.status).not.toBe(503);
    expect(await res.text()).toBe('<html>cached dashboard</html>');
  });

  it('офлайн + страница НЕ посещалась, но другие страницы в кеше -> отдаёт другую закешированную страницу вместо "Offline"', async () => {
    const cache = new FakeCache();
    const visited = new Request('https://app.test/app/dashboard');
    await cache.put(visited, new Response('<html>app shell</html>'));
    const neverVisited = new Request('https://app.test/app/dashboard/songs/42');
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await handleNavigation(cache, neverVisited, fetcher);

    expect(res.status).not.toBe(503);
    expect(await res.text()).toBe('<html>app shell</html>');
  });

  it('офлайн + кеш пуст (самый первый визит без сети) -> bare "Offline" 503', async () => {
    const cache = new FakeCache();
    const request = new Request('https://app.test/app/dashboard');
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await handleNavigation(cache, request, fetcher);

    expect(res.status).toBe(503);
    expect(await res.text()).toBe('Offline');
  });
});
