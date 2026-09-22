/**
 * Запись песни (M9, T2): гейт роли и контракт тела. Реальный гейт — BFF, поэтому
 * отказ для `reader` и `musician` проверяется здесь, а не в правах Directus.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminRequestMock } = vi.hoisted(() => ({ adminRequestMock: vi.fn() }));

vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));

import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { createApp } from '../app';

async function sessionCookie(directusId = 'user-1'): Promise<string> {
  const sealed = await sealSession({ directus_id: directusId, first_name: 'Test' });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

/** Тело запроса, ушедшего в Directus n-м вызовом (команды SDK v20 — функции-дескрипторы). */
function itemsPayload(callIndex: number): Record<string, unknown> {
  const command = adminRequestMock.mock.calls[callIndex]?.[0] as (() => { body: string }) | undefined;
  if (typeof command !== 'function') throw new Error(`нет вызова Directus с индексом ${callIndex}`);
  return JSON.parse(command().body);
}

function mockRole(name: string) {
  adminRequestMock.mockResolvedValueOnce({ role: { name } });
}

const VALID_BODY = { title: 'Новая песня', content: '{comment: Куплет}\n[G]Слава' };

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  adminRequestMock.mockReset();
});

async function post(body: unknown, cookie?: string) {
  return createApp().request('/app/api/songs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function put(id: string, body: unknown, cookie?: string) {
  return createApp().request(`/app/api/songs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe('POST /api/songs', () => {
  it('без сессии -> 401', async () => {
    expect((await post(VALID_BODY)).status).toBe(401);
  });

  it('роль "Чтец" -> 403', async () => {
    mockRole('Чтец');
    expect((await post(VALID_BODY, await sessionCookie())).status).toBe(403);
  });

  it('роль "musician" (сетлисты, но не песни) -> 403', async () => {
    mockRole('musician');
    expect((await post(VALID_BODY, await sessionCookie())).status).toBe(403);
  });

  it('musician_editor -> 201, сервер сам ставит slug, sort и published', async () => {
    mockRole('musician_editor');
    adminRequestMock.mockResolvedValueOnce([{ sort: 97 }]); // max(sort)
    adminRequestMock.mockResolvedValueOnce([]); // занятых slug с таким префиксом нет
    adminRequestMock.mockResolvedValueOnce({ id: 98 });

    const res = await post({ ...VALID_BODY, songKey: 'G', tempo: 80 }, await sessionCookie());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 98 });
    expect(itemsPayload(3)).toEqual({
      title: 'Новая песня',
      song_key: 'G',
      tempo: 80,
      content: VALID_BODY.content,
      slug: '98-новая-песня',
      sort: 98,
      status: 'published',
    });
  });

  it('занятый slug нумеруется, а не падает на UNIQUE', async () => {
    mockRole('musician_editor');
    adminRequestMock.mockResolvedValueOnce([{ sort: 97 }]);
    adminRequestMock.mockResolvedValueOnce([{ slug: '98-новая-песня' }]);
    adminRequestMock.mockResolvedValueOnce({ id: 99 });

    expect((await post(VALID_BODY, await sessionCookie())).status).toBe(201);
    expect(itemsPayload(3).slug).toBe('98-новая-песня-2');
  });

  it('пустой каталог -> sort 1', async () => {
    mockRole('musician_editor');
    adminRequestMock.mockResolvedValueOnce([]);
    adminRequestMock.mockResolvedValueOnce([]);
    adminRequestMock.mockResolvedValueOnce({ id: 1 });

    expect((await post(VALID_BODY, await sessionCookie())).status).toBe(201);
    expect(itemsPayload(3)).toMatchObject({ sort: 1, slug: '1-новая-песня' });
  });

  it('битое тело -> 400, в Directus ничего не ушло', async () => {
    mockRole('musician_editor');
    const res = await post({ title: '  ', content: '' }, await sessionCookie());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Название обязательно' });
    // Единственный вызов — резолв роли.
    expect(adminRequestMock).toHaveBeenCalledTimes(1);
  });

  it('сбой Directus -> 500', async () => {
    mockRole('musician_editor');
    adminRequestMock.mockRejectedValueOnce(new Error('directus down'));
    expect((await post(VALID_BODY, await sessionCookie())).status).toBe(500);
  });
});

describe('PUT /api/songs/:id', () => {
  it('без сессии -> 401', async () => {
    expect((await put('12', { title: 'X' })).status).toBe(401);
  });

  it('роль "musician" -> 403', async () => {
    mockRole('musician');
    expect((await put('12', { title: 'X' }, await sessionCookie())).status).toBe(403);
  });

  it('musician_editor -> 200, патч частичный, slug и status не трогаются', async () => {
    mockRole('musician_editor');
    adminRequestMock.mockResolvedValueOnce({ id: 12 });

    const res = await put('12', { content: '{comment: Припев}\nАллилуйя' }, await sessionCookie());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(itemsPayload(1)).toEqual({ content: '{comment: Припев}\nАллилуйя' });
  });

  it('нечисловой id -> 400', async () => {
    mockRole('musician_editor');
    expect((await put('abc', { title: 'X' }, await sessionCookie())).status).toBe(400);
  });

  it('пустой патч -> 400 (иначе молча поднялась бы версия песни)', async () => {
    mockRole('musician_editor');
    const res = await put('12', {}, await sessionCookie());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Нечего сохранять' });
  });

  it('неизвестная песня -> 404', async () => {
    mockRole('musician_editor');
    adminRequestMock.mockRejectedValueOnce(
      Object.assign(new Error('Request failed'), { errors: [{ message: 'not found' }] }),
    );
    expect((await put('999', { title: 'X' }, await sessionCookie())).status).toBe(404);
  });

  it('PUT /:id/state остаётся личным маршрутом и роль не требует', async () => {
    // Регрессия на порядок роутов: `requireSongWrite` с PUT /:id не должен
    // перехватывать пометки, которые ведёт любой авторизованный, включая reader.
    adminRequestMock.mockResolvedValueOnce([]); // чтение текущих пометок
    adminRequestMock.mockResolvedValueOnce({ id: 'state-1' });

    const res = await put(
      '12/state',
      { strokes: [], updatedAt: 1_758_534_000_000 },
      await sessionCookie(),
    );
    expect(res.status).toBe(200);
  });
});
