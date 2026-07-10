import { describe, expect, it, vi } from 'vitest';
import {
  routeStrategy,
  pathnameToHtmlKey,
  precacheLookupKeys,
  pruneUnknownCaches,
  respondToNavigation,
  respondToStaticAsset,
  toPrecacheRequestUrl,
  OFFLINE_FALLBACK_HTML,
  SW_DISABLED,
} from './sw';

/** Мок precache-кеша (только `match`, install/fetch логика больше не тестируется через .toString()). */
class FakePrecache {
  private store = new Map<string, Response>();

  set(key: string, response: Response) {
    this.store.set(key, response);
  }

  async match(key: string): Promise<Response | undefined> {
    return this.store.get(key);
  }
}

describe('SW_DISABLED', () => {
  it('kill switch выключен по умолчанию', () => {
    expect(SW_DISABLED).toBe(false);
  });
});

describe('pruneUnknownCaches', () => {
  it('пустой список кешей -> нечего удалять', () => {
    expect(pruneUnknownCaches([], ['app-shell-precache-v1'])).toEqual([]);
  });

  it('все кеши известны -> нечего удалять', () => {
    expect(pruneUnknownCaches(['app-shell-precache-v1'], ['app-shell-precache-v1'])).toEqual([]);
  });

  it('смесь известных и чужих кешей -> возвращает только чужие', () => {
    expect(
      pruneUnknownCaches(
        ['app-shell-precache-v1', 'workbox-precache-old', 'some-legacy-cache'],
        ['app-shell-precache-v1']
      )
    ).toEqual(['workbox-precache-old', 'some-legacy-cache']);
  });
});

describe('routeStrategy', () => {
  it('passthrough для non-GET', () => {
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

  it('precache-navigation для настоящих HTML-навигаций (mode=navigate, корень)', () => {
    expect(routeStrategy('/app/', 'GET', true, 'navigate')).toBe('precache-navigation');
  });

  it('precache-navigation для настоящих HTML-навигаций (mode=navigate, ридер)', () => {
    expect(routeStrategy('/app/dashboard/read', 'GET', true, 'navigate')).toBe('precache-navigation');
  });

  it('precache-static для same-origin GET не-навигаций (чанки, RSC/flight .txt export)', () => {
    expect(routeStrategy('/app/_next/static/chunks/main.js', 'GET', true, 'no-cors')).toBe('precache-static');
    expect(routeStrategy('/app/dashboard/songs.txt', 'GET', true, 'cors')).toBe('precache-static');
  });
});

describe('pathnameToHtmlKey', () => {
  it('корень basePath -> index.html', () => {
    expect(pathnameToHtmlKey('/app', '/app')).toBe('/app/index.html');
    expect(pathnameToHtmlKey('/app/', '/app')).toBe('/app/index.html');
  });

  it('обычный маршрут -> pathname + .html', () => {
    expect(pathnameToHtmlKey('/app/dashboard', '/app')).toBe('/app/dashboard.html');
  });

  it('ридер: один и тот же ключ независимо от search (approach C — search не участвует в ключе)', () => {
    expect(pathnameToHtmlKey('/app/dashboard/read', '/app')).toBe('/app/dashboard/read.html');
  });
});

describe('precacheLookupKeys', () => {
  it('RSC-пейлоад с _rsc и search -> точный URL, затем URL без query', () => {
    expect(precacheLookupKeys('/app/dashboard/read.txt?book=john&_rsc=abc')).toEqual([
      '/app/dashboard/read.txt?book=john&_rsc=abc',
      '/app/dashboard/read.txt',
    ]);
  });

  it('URL без query -> единственный ключ (лишний cache.match не нужен)', () => {
    expect(precacheLookupKeys('/app/_next/static/chunks/main.js')).toEqual([
      '/app/_next/static/chunks/main.js',
    ]);
  });
});

describe('toPrecacheRequestUrl', () => {
  it('манифест без ведущего слэша -> собирает URL совпадающий с pathnameToHtmlKey', () => {
    expect(toPrecacheRequestUrl('/app', 'dashboard.html')).toBe('/app/dashboard.html');
    expect(toPrecacheRequestUrl('/app', 'index.html')).toBe('/app/index.html');
    expect(toPrecacheRequestUrl('/app', 'dashboard/calendar.html')).toBe('/app/dashboard/calendar.html');
  });

  it('ключ install (toPrecacheRequestUrl) и ключ чтения (pathnameToHtmlKey) совпадают для одного маршрута', () => {
    expect(toPrecacheRequestUrl('/app', 'dashboard.html')).toBe(pathnameToHtmlKey('/app/dashboard', '/app'));
    expect(toPrecacheRequestUrl('/app', 'index.html')).toBe(pathnameToHtmlKey('/app/', '/app'));
  });
});

describe('respondToNavigation', () => {
  it('точное совпадение в precache -> отдаёт закешированный документ', async () => {
    const cache = new FakePrecache();
    cache.set('/app/dashboard.html', new Response('<html>dashboard</html>'));

    const res = await respondToNavigation(cache, '/app/dashboard', '/app', OFFLINE_FALLBACK_HTML);

    expect(await res.text()).toBe('<html>dashboard</html>');
  });

  it('корень basePath резолвится в index.html', async () => {
    const cache = new FakePrecache();
    cache.set('/app/index.html', new Response('<html>index</html>'));

    const res = await respondToNavigation(cache, '/app/', '/app', OFFLINE_FALLBACK_HTML);

    expect(await res.text()).toBe('<html>index</html>');
  });

  it('маршрут не входит в precache (не посещался / не существует) -> статическая офлайн-заглушка, НЕ чужой HTML', async () => {
    const cache = new FakePrecache();
    cache.set('/app/dashboard.html', new Response('<html>dashboard</html>'));

    const res = await respondToNavigation(cache, '/app/unknown-route', '/app', OFFLINE_FALLBACK_HTML);

    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toBe(OFFLINE_FALLBACK_HTML);
    expect(body).not.toBe('<html>dashboard</html>');
  });

  it('пустой precache -> статическая офлайн-заглушка', async () => {
    const cache = new FakePrecache();

    const res = await respondToNavigation(cache, '/app/dashboard', '/app', OFFLINE_FALLBACK_HTML);

    expect(res.status).toBe(503);
    expect(await res.text()).toBe(OFFLINE_FALLBACK_HTML);
  });
});

describe('respondToStaticAsset', () => {
  it('попадание в precache -> сеть не запрашивается', async () => {
    const cache = new FakePrecache();
    cache.set('https://app.test/app/_next/static/chunks/main.js', new Response('cached-chunk'));
    const fetcher = vi.fn();

    const res = await respondToStaticAsset(cache, 'https://app.test/app/_next/static/chunks/main.js', fetcher);

    expect(await res.text()).toBe('cached-chunk');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('RSC-пейлоад клиентской навигации (_rsc + search) -> попадание по ключу без query, сеть не нужна', async () => {
    const cache = new FakePrecache();
    cache.set('https://app.test/app/dashboard/read.txt', new Response('flight-payload'));
    const fetcher = vi.fn();

    const res = await respondToStaticAsset(
      cache,
      'https://app.test/app/dashboard/read.txt?book=john&chapter=3&_rsc=1a2b3c',
      fetcher
    );

    expect(await res.text()).toBe('flight-payload');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('segment-prefetch пейлоад (__next.*.txt + _rsc) -> попадание в precache, сеть не нужна', async () => {
    const cache = new FakePrecache();
    cache.set('https://app.test/app/dashboard/__next.dashboard.__PAGE__.txt', new Response('segment'));
    const fetcher = vi.fn();

    const res = await respondToStaticAsset(
      cache,
      'https://app.test/app/dashboard/__next.dashboard.__PAGE__.txt?_rsc=abc',
      fetcher
    );

    expect(await res.text()).toBe('segment');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('промах precache (файл вне манифеста) -> сетевой фолбэк ровно один раз', async () => {
    const cache = new FakePrecache();
    const fetcher = vi.fn().mockResolvedValue(new Response('from-network'));

    const res = await respondToStaticAsset(cache, 'https://app.test/app/favicon.ico', fetcher);

    expect(await res.text()).toBe('from-network');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('промах precache для URL с query -> сетевой фолбэк ровно один раз (оба ключа проверены)', async () => {
    const cache = new FakePrecache();
    const fetcher = vi.fn().mockResolvedValue(new Response('from-network'));

    const res = await respondToStaticAsset(cache, 'https://app.test/app/unknown.txt?_rsc=abc', fetcher);

    expect(await res.text()).toBe('from-network');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
