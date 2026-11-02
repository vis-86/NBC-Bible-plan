import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminRequestMock, getUserTeamIdMock } = vi.hoisted(() => ({
  adminRequestMock: vi.fn(),
  getUserTeamIdMock: vi.fn(),
}));

vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));
vi.mock('../../../src/lib/teams', () => ({
  getUserTeamId: getUserTeamIdMock,
}));

import { songStateId } from '../../../src/features/songs/services/songStateServer';
import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { createApp } from '../app';

async function sessionCookie(directusId = 'user-1'): Promise<string> {
  const sealed = await sealSession({ directus_id: directusId, first_name: 'Test' });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

/** Тело запроса, ушедшего в Directus n-м вызовом `client.request` (команды SDK v20 — дескрипторы). */
function itemsPayload(callIndex: number): Record<string, unknown> {
  const command = adminRequestMock.mock.calls[callIndex]?.[0] as (() => { body: string }) | undefined;
  if (typeof command !== 'function') throw new Error(`нет вызова Directus с индексом ${callIndex}`);
  return JSON.parse(command().body);
}

function notFound() {
  return Object.assign(new Error('Not found'), { response: { status: 403 } });
}

/** Песня 42 есть в команде пользователя — первый запрос PUT пометок. */
function mockSongInTeam() {
  adminRequestMock.mockResolvedValueOnce([{ id: 42, title: 'Песня', content: '' }]);
}

type DirectusCommand = () => { path: string; method: string; params?: { filter?: unknown } };

const stroke = {
  id: 's1',
  tool: 'pen' as const,
  anchor: { section: 0, line: 2 },
  points: [
    [1, 2, 0.5],
    [3, 4, 0.6],
  ],
  color: '#111827',
  width: 3,
};

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  adminRequestMock.mockReset();
  getUserTeamIdMock.mockReset();
  getUserTeamIdMock.mockResolvedValue('team-a');
});

describe('songStateId', () => {
  it('детерминирован и различает пользователей и песни', () => {
    expect(songStateId('user-1', 42)).toBe(songStateId('user-1', 42));
    expect(songStateId('user-1', 42)).not.toBe(songStateId('user-2', 42));
    expect(songStateId('user-1', 42)).not.toBe(songStateId('user-1', 43));
  });

  it('выдаёт валидный UUID версии 5', () => {
    expect(songStateId('user-1', 42)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('GET /api/songs/:id/state', () => {
  it('без сессии -> 401', async () => {
    const res = await createApp().request('/app/api/songs/42/state');
    expect(res.status).toBe(401);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('битый id -> 400', async () => {
    const res = await createApp().request('/app/api/songs/abc/state', {
      headers: { cookie: await sessionCookie() },
    });
    expect(res.status).toBe(400);
  });

  it('записи нет -> пустой набор, а не 404', async () => {
    adminRequestMock.mockRejectedValueOnce(notFound());
    const res = await createApp().request('/app/api/songs/42/state', {
      headers: { cookie: await sessionCookie() },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ annotations: { strokes: [], updatedAt: 0 } });
  });

  it('читает запись по id, выведенному из сессии', async () => {
    adminRequestMock.mockResolvedValueOnce({ strokes: [stroke], updated_at: '2026-07-29T10:00:00.000Z' });
    const res = await createApp().request('/app/api/songs/42/state', {
      headers: { cookie: await sessionCookie('user-1') },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      annotations: { strokes: [stroke], updatedAt: Date.parse('2026-07-29T10:00:00.000Z') },
    });
    const command = adminRequestMock.mock.calls[0][0] as () => { path: string };
    expect(command().path).toContain(songStateId('user-1', 42));
  });

  it('Directus упал -> 502', async () => {
    adminRequestMock.mockRejectedValueOnce(new Error('boom'));
    const res = await createApp().request('/app/api/songs/42/state', {
      headers: { cookie: await sessionCookie() },
    });
    expect(res.status).toBe(502);
  });

  it('без команды -> 403', async () => {
    getUserTeamIdMock.mockResolvedValue(null);
    const res = await createApp().request('/app/api/songs/42/state', {
      headers: { cookie: await sessionCookie() },
    });
    expect(res.status).toBe(403);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('песню не проверяет: один запрос — к собственным пометкам', async () => {
    adminRequestMock.mockRejectedValueOnce(notFound());
    await createApp().request('/app/api/songs/42/state', { headers: { cookie: await sessionCookie() } });

    expect(adminRequestMock).toHaveBeenCalledTimes(1);
    expect((adminRequestMock.mock.calls[0][0] as DirectusCommand)().path).toContain('song_user_state');
  });
});

describe('PUT /api/songs/:id/state', () => {
  const body = { strokes: [stroke], updatedAt: 1_800_000_000_000 };

  async function put(payload: unknown, cookie?: string) {
    return createApp().request('/app/api/songs/42/state', {
      method: 'PUT',
      headers: { cookie: cookie ?? (await sessionCookie()), 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  it('без сессии -> 401', async () => {
    const res = await createApp().request('/app/api/songs/42/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(401);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('битое тело -> 400', async () => {
    const res = await put({ strokes: [{ ...stroke, tool: 'laser' }], updatedAt: 1 });
    expect(res.status).toBe(400);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('создаёт запись, когда её ещё нет', async () => {
    mockSongInTeam();
    adminRequestMock.mockRejectedValueOnce(notFound()); // readItem
    adminRequestMock.mockResolvedValueOnce({}); // createItem

    const res = await put(body, await sessionCookie('user-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', updatedAt: body.updatedAt });

    const created = itemsPayload(2);
    expect(created).toMatchObject({
      id: songStateId('user-1', 42),
      user_id: 'user-1',
      song: 42,
      updated_at: new Date(body.updatedAt).toISOString(),
    });
  });

  it('чужой user_id в теле игнорируется — владелец берётся из сессии', async () => {
    mockSongInTeam();
    adminRequestMock.mockRejectedValueOnce(notFound());
    adminRequestMock.mockResolvedValueOnce({});

    const res = await put({ ...body, user_id: 'victim', song: 999 }, await sessionCookie('user-1'));
    expect(res.status).toBe(200);

    const created = itemsPayload(2);
    expect(created.user_id).toBe('user-1');
    expect(created.song).toBe(42);
    expect(created.id).toBe(songStateId('user-1', 42));
  });

  it('обновляет существующую запись, если пришедшая правка новее', async () => {
    mockSongInTeam();
    adminRequestMock.mockResolvedValueOnce({ updated_at: '2026-07-01T00:00:00.000Z' });
    adminRequestMock.mockResolvedValueOnce({});

    const res = await put(body);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
    expect(itemsPayload(2).updated_at).toBe(new Date(body.updatedAt).toISOString());
  });

  it('LWW: устаревшая правка отбрасывается и в Directus не пишется', async () => {
    mockSongInTeam();
    adminRequestMock.mockResolvedValueOnce({ updated_at: new Date(body.updatedAt + 60_000).toISOString() });

    const res = await put(body);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('stale');
    expect(adminRequestMock).toHaveBeenCalledTimes(2); // песня и пометки — только чтение, записи не было
  });

  it('гонка на create (RECORD_NOT_UNIQUE) -> повторный update, а не вторая запись', async () => {
    mockSongInTeam();
    adminRequestMock.mockRejectedValueOnce(notFound()); // readItem
    adminRequestMock.mockRejectedValueOnce({ errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE' } }] });
    adminRequestMock.mockResolvedValueOnce({}); // updateItem

    const res = await put(body);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
    expect(adminRequestMock).toHaveBeenCalledTimes(4);
  });

  it('Directus упал -> 502', async () => {
    mockSongInTeam();
    adminRequestMock.mockRejectedValueOnce(new Error('boom'));
    const res = await put(body);
    expect(res.status).toBe(502);
  });

  it('сбой Directus при поиске песни -> 502, пометки не пишутся', async () => {
    adminRequestMock.mockRejectedValueOnce(new Error('boom'));
    const res = await put(body);
    expect(res.status).toBe(502);
    expect(adminRequestMock).toHaveBeenCalledTimes(1);
  });

  it('без команды -> 403, в Directus ничего не уходит', async () => {
    getUserTeamIdMock.mockResolvedValue(null);
    const res = await put(body);
    expect(res.status).toBe(403);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('песня другой команды -> 404, пометки не читаются и не пишутся', async () => {
    adminRequestMock.mockResolvedValueOnce([]); // в команде team-a песни 42 нет

    const res = await put(body, await sessionCookie('user-1'));
    expect(res.status).toBe(404);

    expect(adminRequestMock).toHaveBeenCalledTimes(1);
    const lookup = (adminRequestMock.mock.calls[0][0] as DirectusCommand)();
    expect(lookup.path).toBe('/items/songs');
    expect(lookup.params?.filter).toEqual({ id: { _eq: 42 }, team: { _eq: 'team-a' } });
  });
});
