import { describe, expect, it } from 'vitest';
import { routeStrategy } from './sw-source';

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
