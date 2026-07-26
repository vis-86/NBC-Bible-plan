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

/**
 * Тело запроса, ушедшего в Directus n-м вызовом `client.request`. Команды SDK v20 —
 * функции-дескрипторы (`() => { path, method, body }`), поэтому разворачиваем и парсим.
 */
function itemsPayload(callIndex: number): unknown {
  const command = adminRequestMock.mock.calls[callIndex]?.[0] as (() => { body: string }) | undefined;
  if (typeof command !== 'function') throw new Error(`нет вызова Directus с индексом ${callIndex}`);
  return JSON.parse(command().body);
}

/** Роль по умолчанию для write-роутов — musician (право на запись). */
function mockMusicianRole() {
  adminRequestMock.mockResolvedValueOnce({ role: { name: 'musician' } });
}
function mockReaderRole() {
  adminRequestMock.mockResolvedValueOnce({ role: { name: 'Чтец' } });
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  adminRequestMock.mockReset();
});

describe('GET /api/setlists', () => {
  it('без сессии -> 401', async () => {
    const app = createApp();
    const res = await app.request('/app/api/setlists');
    expect(res.status).toBe(401);
  });

  it('сортировка: сет с датой раньше сета без даты', async () => {
    adminRequestMock.mockResolvedValueOnce([
      { id: 'no-date', title: 'Без даты', date: null, date_created: '2026-01-01T00:00:00Z' },
      { id: 'has-date', title: 'С датой', date: '2026-08-01', date_created: '2026-01-02T00:00:00Z' },
    ]);
    adminRequestMock.mockResolvedValueOnce([
      { setlist: 'has-date', song: 41, sort: 0 },
      { setlist: 'has-date', song: 70, sort: 1 },
    ]);
    adminRequestMock.mockResolvedValueOnce([
      { id: 41, title: 'Придите все', song_key: 'Bb' },
      { id: 70, title: 'От небесных вершин', song_key: null },
    ]);

    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.setlists.map((s: { id: string }) => s.id)).toEqual(['has-date', 'no-date']);
    // Состав приходит вместе со списком: карточка рендерит песни без запроса детали.
    expect(body.setlists[0].items).toEqual([
      { songId: 41, title: 'Придите все', songKey: 'Bb' },
      { songId: 70, title: 'От небесных вершин' },
    ]);
    expect(body.setlists[1].items).toEqual([]);
  });
});

describe('GET /api/setlists/:id', () => {
  it('невалидный uuid -> 400', async () => {
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists/not-a-uuid', { headers: { Cookie: cookie } });
    expect(res.status).toBe(400);
  });

  it('не найден -> 404', async () => {
    adminRequestMock.mockRejectedValueOnce(new Error('not found'));
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists/11111111-1111-1111-1111-111111111111', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(404);
  });

  it('деталь: items по sort, orphan-item (song=null) отфильтрован', async () => {
    adminRequestMock.mockResolvedValueOnce({ id: 'set-1', title: 'Сет', date: '2026-08-01' });
    adminRequestMock.mockResolvedValueOnce([
      { id: 'item-1', song: 1, sort: 0 },
      { id: 'item-2', song: 2, sort: 1 },
      { id: 'item-orphan', song: null, sort: 2 },
    ]);
    adminRequestMock.mockResolvedValueOnce([
      { id: 1, title: 'Песня 1', subtitle: null, song_key: 'C' },
      { id: 2, title: 'Песня 2', subtitle: 'sub', song_key: 'G' },
    ]);

    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists/11111111-1111-1111-1111-111111111111', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.setlist.items).toHaveLength(2);
    expect(body.setlist.items.map((i: { songId: number }) => i.songId)).toEqual([1, 2]);
  });
});

describe('POST /api/setlists — 403 для reader (обязательный кейс)', () => {
  it('reader не может создать сет', async () => {
    mockReaderRole();
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Сет', songIds: [1] }),
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH/DELETE /api/setlists/:id — 403 для reader', () => {
  it('reader не может отредактировать', async () => {
    mockReaderRole();
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists/11111111-1111-1111-1111-111111111111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Новое' }),
    });
    expect(res.status).toBe(403);
  });

  it('reader не может удалить', async () => {
    mockReaderRole();
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists/11111111-1111-1111-1111-111111111111', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/setlists — создание (musician)', () => {
  it('201, порядок sort соответствует порядку songIds', async () => {
    mockMusicianRole();
    adminRequestMock.mockResolvedValueOnce({ id: 'new-set' });
    adminRequestMock.mockResolvedValueOnce([]);

    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Новый сет', songIds: [3, 1, 2] }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'new-set' });

    // `sort` — единственный носитель порядка: если он не идёт по индексу songIds,
    // drag «работает», но после перезагрузки порядок откатывается.
    expect(itemsPayload(2)).toEqual([
      { setlist: 'new-set', song: 3, sort: 0 },
      { setlist: 'new-set', song: 1, sort: 1 },
      { setlist: 'new-set', song: 2, sort: 2 },
    ]);
  });

  it('дубликаты в songIds -> 400', async () => {
    mockMusicianRole();
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Сет', songIds: [1, 1] }),
    });
    expect(res.status).toBe(400);
  });

  it('пустой массив songIds -> 400', async () => {
    mockMusicianRole();
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Сет', songIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('title из пробелов -> 400', async () => {
    mockMusicianRole();
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: '   ', songIds: [1] }),
    });
    expect(res.status).toBe(400);
  });

  it('кривая дата -> 400', async () => {
    mockMusicianRole();
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Сет', date: '01.08.2026', songIds: [1] }),
    });
    expect(res.status).toBe(400);
  });

  it('несуществующий songId (FK-ошибка Directus) -> 400, не 500', async () => {
    mockMusicianRole();
    adminRequestMock.mockResolvedValueOnce({ id: 'new-set' });
    adminRequestMock.mockRejectedValueOnce(new Error('violates foreign key constraint'));
    adminRequestMock.mockResolvedValueOnce({}); // compensation delete

    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Сет', songIds: [999] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown song id' });
  });
});

describe('PATCH /api/setlists/:id — musician', () => {
  it('заменяет состав, PATCH проходит', async () => {
    mockMusicianRole();
    adminRequestMock.mockResolvedValueOnce({}); // updateItem title
    adminRequestMock.mockResolvedValueOnce({}); // deleteItems old items
    adminRequestMock.mockResolvedValueOnce([]); // createItems new items

    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists/11111111-1111-1111-1111-111111111111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Обновлено', songIds: [2, 1] }),
    });
    expect(res.status).toBe(200);
  });

  it('переставленный songIds сохраняется как sort по индексу (порядок после drag не откатится)', async () => {
    mockMusicianRole();
    adminRequestMock.mockResolvedValueOnce({}); // deleteItems старых items
    adminRequestMock.mockResolvedValueOnce([]); // createItems новых items

    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists/11111111-1111-1111-1111-111111111111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ songIds: [3, 1, 2] }),
    });
    expect(res.status).toBe(200);

    // Без title/date патч самого сета не отправляется, поэтому createItems — вызов №2.
    expect(itemsPayload(2)).toEqual([
      { setlist: '11111111-1111-1111-1111-111111111111', song: 3, sort: 0 },
      { setlist: '11111111-1111-1111-1111-111111111111', song: 1, sort: 1 },
      { setlist: '11111111-1111-1111-1111-111111111111', song: 2, sort: 2 },
    ]);
  });
});

describe('DELETE /api/setlists/:id — musician', () => {
  it('204/200 успешное удаление', async () => {
    mockMusicianRole();
    adminRequestMock.mockResolvedValueOnce({});

    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists/11111111-1111-1111-1111-111111111111', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
  });
});
