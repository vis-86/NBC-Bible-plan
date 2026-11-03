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
  getUserTeamIdMock.mockReset();
  getUserTeamIdMock.mockResolvedValue('team-a');
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
    adminRequestMock.mockResolvedValueOnce([]);
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/setlists/11111111-1111-1111-1111-111111111111', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(404);
  });

  it('деталь: items по sort, orphan-item (song=null) отфильтрован', async () => {
    adminRequestMock.mockResolvedValueOnce([{ id: 'set-1', title: 'Сет', date: '2026-08-01' }]);
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
    adminRequestMock.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]); // песни команды
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
    expect(itemsPayload(3)).toEqual([
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
    // Проверку команды песня прошла, но к записи её уже удалили — FK-ошибка Directus.
    adminRequestMock.mockResolvedValueOnce([{ id: 999 }]);
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
    adminRequestMock.mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111' }]); // сет команды
    adminRequestMock.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // песни команды
    adminRequestMock.mockResolvedValueOnce({}); // updateItems title
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
    adminRequestMock.mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111' }]); // сет команды
    adminRequestMock.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]); // песни команды
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

    // Без title/date патч самого сета не отправляется, поэтому createItems — вызов №4
    // (после роли, проверки сета, проверки песен и удаления старых items).
    expect(itemsPayload(4)).toEqual([
      { setlist: '11111111-1111-1111-1111-111111111111', song: 3, sort: 0 },
      { setlist: '11111111-1111-1111-1111-111111111111', song: 1, sort: 1 },
      { setlist: '11111111-1111-1111-1111-111111111111', song: 2, sort: 2 },
    ]);
  });
});

describe('DELETE /api/setlists/:id — musician', () => {
  it('204/200 успешное удаление', async () => {
    mockMusicianRole();
    adminRequestMock.mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111' }]); // сет команды
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

describe('сеты видны и меняются только в своей команде', () => {
  const SET_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SET_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  type Row = Record<string, unknown>;
  type Filter = Record<string, Record<string, unknown>>;
  type DirectusCommand = () => { path: string; method: string; params?: { filter?: Filter }; body?: string };

  const setlists: Row[] = [
    { id: SET_A, title: 'Сет A', date: null, date_created: '2026-01-01T00:00:00Z', team: 'team-a' },
    { id: SET_B, title: 'Сет B', date: null, date_created: '2026-01-02T00:00:00Z', team: 'team-b' },
  ];
  const items: Row[] = [
    { id: 'item-a', setlist: SET_A, song: 1, sort: 0 },
    { id: 'item-b', setlist: SET_B, song: 2, sort: 0 },
  ];
  const songs: Row[] = [
    { id: 1, title: 'Песня A', song_key: 'C', team: 'team-a' },
    { id: 2, title: 'Песня B', song_key: 'D', team: 'team-b' },
  ];
  const tables: Record<string, Row[]> = { setlists, setlist_items: items, songs };

  /** Фильтр как в Directus: `_eq`, `_in` и M2O `setlist` (позиция → её сет). */
  function matches(row: Row, filter: Filter | undefined): boolean {
    if (!filter) return true;
    return Object.entries(filter).every(([field, cond]) => {
      if ('_eq' in cond) return row[field] === cond._eq;
      if ('_in' in cond) return (cond._in as unknown[]).includes(row[field]);
      if (field === 'setlist') {
        const parent = setlists.find((s) => s.id === row.setlist);
        return !!parent && matches(parent, cond as Filter);
      }
      throw new Error(`фильтр ${field} не поддержан фейком`);
    });
  }

  /** Все не-GET вызовы Directus — чтобы проверять «ни одной записи». */
  let writes: Array<{ path: string; method: string }>;

  function directusWithTwoTeams() {
    writes = [];
    adminRequestMock.mockImplementation(async (command: DirectusCommand) => {
      const { path, method, params, body } = command();
      if (path.startsWith('/users/')) return { role: { name: 'musician' } };
      const collection = path.match(/^\/items\/([a-z_]+)$/)?.[1];
      const table = collection ? tables[collection] : undefined;
      if (!table) throw new Error(`неожиданный вызов Directus ${method} ${path}`);
      if (method === 'GET') return table.filter((row) => matches(row, params?.filter));
      writes.push({ path, method });
      const parsed = body ? JSON.parse(body) : null;
      if (method === 'POST') return Array.isArray(parsed) ? [] : { id: 'new-set' };
      return [];
    });
    getUserTeamIdMock.mockImplementation(async (directusId: string) =>
      directusId === 'user-a' ? 'team-a' : directusId === 'user-b' ? 'team-b' : null,
    );
  }

  beforeEach(() => {
    directusWithTwoTeams();
  });

  it('без команды -> 403 на всех роутах, Directus не запрашивается', async () => {
    getUserTeamIdMock.mockResolvedValue(null);
    const app = createApp();
    const cookie = await sessionCookie('user-nobody');
    const requests: Array<[string, RequestInit]> = [
      ['/app/api/setlists', {}],
      [`/app/api/setlists/${SET_A}`, {}],
      ['/app/api/setlists', { method: 'POST', body: JSON.stringify({ title: 'Сет', songIds: [1] }) }],
      [`/app/api/setlists/${SET_A}`, { method: 'PATCH', body: JSON.stringify({ title: 'Новое' }) }],
      [`/app/api/setlists/${SET_A}`, { method: 'DELETE' }],
    ];
    for (const [url, init] of requests) {
      const res = await app.request(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
      });
      expect(res.status, `${init.method ?? 'GET'} ${url}`).toBe(403);
    }
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('список — только сеты своей команды', async () => {
    const res = await createApp().request('/app/api/setlists', { headers: { Cookie: await sessionCookie('user-a') } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { setlists: Array<{ id: string; items: Array<{ songId: number }> }> };
    expect(body.setlists.map((s) => s.id)).toEqual([SET_A]);
    expect(body.setlists[0].items.map((i) => i.songId)).toEqual([1]);
  });

  it('GET сета другой команды -> 404', async () => {
    const res = await createApp().request(`/app/api/setlists/${SET_B}`, {
      headers: { Cookie: await sessionCookie('user-a') },
    });
    expect(res.status).toBe(404);
  });

  it('GET своего сета -> 200 (контроль: фейк отдаёт свои сеты)', async () => {
    const res = await createApp().request(`/app/api/setlists/${SET_B}`, {
      headers: { Cookie: await sessionCookie('user-b') },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { setlist: { title: string } }).setlist.title).toBe('Сет B');
  });

  it('PATCH сета другой команды -> 404, ни одной записи', async () => {
    const res = await createApp().request(`/app/api/setlists/${SET_B}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: await sessionCookie('user-a') },
      body: JSON.stringify({ title: 'Чужое', songIds: [1] }),
    });
    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });

  it('DELETE сета другой команды -> 404, ни одной записи', async () => {
    const res = await createApp().request(`/app/api/setlists/${SET_B}`, {
      method: 'DELETE',
      headers: { Cookie: await sessionCookie('user-a') },
    });
    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });

  it('POST с песней другой команды -> 400, ни одной записи', async () => {
    const res = await createApp().request('/app/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: await sessionCookie('user-a') },
      body: JSON.stringify({ title: 'Сет', songIds: [1, 2] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown song id' });
    expect(writes).toEqual([]);
  });

  it('PATCH своего сета с песней другой команды -> 400, ни одной записи', async () => {
    const res = await createApp().request(`/app/api/setlists/${SET_A}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: await sessionCookie('user-a') },
      body: JSON.stringify({ title: 'Новое', songIds: [2] }),
    });
    expect(res.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('POST со своими песнями -> 201 (контроль)', async () => {
    const res = await createApp().request('/app/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: await sessionCookie('user-a') },
      body: JSON.stringify({ title: 'Сет', songIds: [1] }),
    });
    expect(res.status).toBe(201);
    expect(writes.map((w) => w.path)).toEqual(['/items/setlists', '/items/setlist_items']);
  });
});
