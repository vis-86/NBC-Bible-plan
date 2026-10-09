/**
 * Публичная ссылка на песню: гость получает только опубликованную песню с `visibility = public`,
 * а каталог и деталь `/songs*` без сессии закрыты.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminRequestMock } = vi.hoisted(() => ({ adminRequestMock: vi.fn() }));

vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));

import { createApp } from '../app';

/** Query-параметры запроса, ушедшего в Directus n-м вызовом (команды SDK v20 — функции-дескрипторы). */
function directusParams(callIndex: number): Record<string, unknown> {
  const command = adminRequestMock.mock.calls[callIndex]?.[0] as (() => { params: Record<string, unknown> }) | undefined;
  if (typeof command !== 'function') throw new Error(`нет вызова Directus с индексом ${callIndex}`);
  return command().params;
}

const ROW = { id: 7, title: 'Песня', song_key: 'G', content: '[G]Слава', visibility: 'public' };

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  adminRequestMock.mockReset();
});

const get = (path: string) => createApp().request(`/app/api${path}`);

describe('GET /api/public/songs/:id', () => {
  it('открытая песня -> 200 без сессии, visibility наружу не уходит', async () => {
    adminRequestMock.mockResolvedValueOnce([ROW]);

    const res = await get('/public/songs/7');

    expect(res.status).toBe(200);
    const { song } = await res.json();
    expect(song).toMatchObject({ id: '7', title: 'Песня', key: 'G', content: '[G]Слава' });
    expect(song).not.toHaveProperty('visibility');
  });

  it('фильтр в Directus: id + опубликована + открыта всем', async () => {
    adminRequestMock.mockResolvedValueOnce([ROW]);
    await get('/public/songs/7');

    expect(directusParams(0).filter).toEqual({
      id: { _eq: 7 },
      status: { _eq: 'published' },
      visibility: { _eq: 'public' },
    });
  });

  it('закрытая или несуществующая -> одинаковый 404', async () => {
    adminRequestMock.mockResolvedValueOnce([]);
    const res = await get('/public/songs/7');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('кривой id -> 400 без похода в Directus', async () => {
    expect((await get('/public/songs/abc')).status).toBe(400);
    expect((await get('/public/songs/0')).status).toBe(400);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('сбой Directus -> 500', async () => {
    adminRequestMock.mockRejectedValueOnce(new Error('directus down'));
    expect((await get('/public/songs/7')).status).toBe(500);
  });
});

describe('GET /api/songs* без сессии', () => {
  it('каталог -> 401', async () => {
    expect((await get('/songs')).status).toBe(401);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('деталь -> 401', async () => {
    expect((await get('/songs/7')).status).toBe(401);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });
});
