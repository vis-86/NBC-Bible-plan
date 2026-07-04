// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { warmAppShell } from './appShell';

/**
 * warmAppShell кладёт документы app-shell маршрутов в HTML-кеш SW для офлайн-навигации.
 * Критично: НИКОГДА не кешировать редирект на логин или не-HTML как документ маршрута —
 * иначе офлайн получим логин-страницу вместо приложения.
 */

type FakeRes = {
  ok: boolean;
  redirected: boolean;
  status: number;
  headers: { get: (k: string) => string | null };
  clone: () => FakeRes;
};

function res(opts: Partial<FakeRes> & { contentType?: string }): FakeRes {
  const r: FakeRes = {
    ok: opts.ok ?? true,
    redirected: opts.redirected ?? false,
    status: opts.status ?? 200,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? (opts.contentType ?? 'text/html; charset=utf-8') : null) },
    clone: () => r,
  };
  return r;
}

function installCaches() {
  const put = vi.fn(async () => {});
  const cache = { put, match: vi.fn(), keys: vi.fn(async () => []) };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  return put;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('warmAppShell', () => {
  it('кеширует успешный HTML-документ маршрута', async () => {
    const put = installCaches();
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: true, contentType: 'text/html' })));

    await warmAppShell();

    // Все 6 маршрутов набора успешно закешированы.
    expect(put).toHaveBeenCalled();
    const urls = put.mock.calls.map((c) => c[0]);
    expect(urls.some((u: string) => u.endsWith('/dashboard/songs'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/dashboard/read?'))).toBe(true);
    expect(urls.some((u: string) => u.endsWith('/dashboard/song'))).toBe(true);
  });

  it('НЕ кеширует редирект (res.redirected) — это логин-страница, не маршрут', async () => {
    const put = installCaches();
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: true, redirected: true, contentType: 'text/html' })));

    await warmAppShell();

    expect(put).not.toHaveBeenCalled();
  });

  it('НЕ кеширует не-HTML ответ', async () => {
    const put = installCaches();
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: true, contentType: 'application/json' })));

    await warmAppShell();

    expect(put).not.toHaveBeenCalled();
  });

  it('НЕ кеширует не-2xx ответ', async () => {
    const put = installCaches();
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: false, status: 403, contentType: 'text/html' })));

    await warmAppShell();

    expect(put).not.toHaveBeenCalled();
  });

  it('не бросает, если Cache API недоступен', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({})));
    // caches не определён (не stubbed) — в jsdom его нет
    await expect(warmAppShell()).resolves.toBeUndefined();
  });
});
