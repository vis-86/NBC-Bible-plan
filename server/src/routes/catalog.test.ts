/**
 * Каталог публичных песен других команд: гейты (сессия → команда → роль), фильтр каталога
 * и копия в команду сессии. Directus — таблица `songs` в памяти, применяющая фильтры запроса.
 */
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

function mockRole(name: string) {
  adminRequestMock.mockResolvedValueOnce({ role: { name } });
}

type SongRow = Record<string, unknown> & { id: number; team: string };

type DirectusCommand = () => {
  path: string;
  method: string;
  params?: {
    fields?: string[];
    filter?: Record<string, Record<string, unknown>>;
    sort?: string[];
    limit?: number;
  };
  body?: string;
};

const TEAM_NAMES: Record<string, string> = { 'team-a': 'Церковь А', 'team-b': 'Церковь Б' };

/** Условие фильтра Directus для одной колонки; `_neq` и NULL — как в SQL: NULL не проходит. */
function matches(value: unknown, condition: Record<string, unknown>): boolean {
  return Object.entries(condition).every(([op, expected]) => {
    if (op === '_eq') return value === expected;
    if (op === '_neq') return value != null && value !== expected;
    if (op === '_nnull') return value != null;
    if (op === '_starts_with') return String(value ?? '').startsWith(String(expected));
    throw new Error(`фейк не знает оператор ${op}`);
  });
}

/** Сортировка Directus: `title` — по возрастанию, `-sort` — по убыванию. */
function sortRows(rows: SongRow[], sort: string[] = []): SongRow[] {
  return [...rows].sort((a, b) => {
    for (const spec of sort) {
      const field = spec.replace(/^-/, '');
      const order = String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'ru', { numeric: true });
      if (order !== 0) return spec.startsWith('-') ? -order : order;
    }
    return 0;
  });
}

/**
 * Directus с таблицей `songs`: список применяет фильтр, сортировку и limit, `team.name` раскрывается
 * в объект, создание записывает строку и возвращает её id. Вызовы, поставленные
 * `mockResolvedValueOnce` (роль), отрабатывают раньше этой реализации.
 */
function directusWithSongs(rows: SongRow[]) {
  adminRequestMock.mockImplementation(async (command: DirectusCommand) => {
    const { path, method, params, body } = command();
    if (path === '/items/songs' && method === 'GET') {
      const filter = params?.filter ?? {};
      const found = sortRows(
        rows.filter((row) => Object.entries(filter).every(([key, cond]) => matches(row[key], cond))),
        params?.sort,
      );
      const limited = params?.limit === -1 ? found : found.slice(0, params?.limit ?? found.length);
      if (!params?.fields?.includes('team.name')) return limited;
      return limited.map((row) => ({ ...row, team: { name: TEAM_NAMES[row.team] } }));
    }
    if (path === '/items/songs' && method === 'POST') {
      const created = { id: 100 + rows.length, ...JSON.parse(body ?? '{}') };
      rows.push(created);
      return { id: created.id };
    }
    throw new Error(`unexpected Directus call ${method} ${path}`);
  });
}

/** Тела записей песен, ушедших в Directus. */
function createdSongs(): Array<Record<string, unknown>> {
  return adminRequestMock.mock.calls
    .map(([command]) => (command as DirectusCommand)())
    .filter(({ path, method }) => path === '/items/songs' && method === 'POST')
    .map(({ body }) => JSON.parse(body ?? '{}'));
}

const PUBLIC = { status: 'published', visibility: 'public', content: '[G]Слава' };

/** Песни трёх видов: своя, чужая открытая, чужая закрытая, чужой черновик, наша копия. */
function catalogRows(): SongRow[] {
  return [
    { id: 1, title: 'Своя открытая', team: 'team-a', ...PUBLIC },
    { id: 2, title: 'Благодать', team: 'team-b', ...PUBLIC },
    { id: 3, title: 'Аллилуйя', team: 'team-b', ...PUBLIC },
    { id: 4, title: 'Закрытая', team: 'team-b', ...PUBLIC, visibility: 'members' },
    { id: 5, title: 'Черновик', team: 'team-b', ...PUBLIC, status: 'draft' },
    { id: 40, title: 'Аллилуйя', team: 'team-a', ...PUBLIC, visibility: 'members', origin_song: 3 },
  ];
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  adminRequestMock.mockReset();
  getUserTeamIdMock.mockReset();
  getUserTeamIdMock.mockResolvedValue('team-a');
});

async function getCatalog(cookie?: string, query = '') {
  return createApp().request(`/app/api/catalog${query}`, { headers: cookie ? { Cookie: cookie } : {} });
}

async function copy(id: string, cookie?: string, body: unknown = {}, query = '') {
  return createApp().request(`/app/api/catalog/${id}/copy${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe('каталог: гейты', () => {
  it('без сессии: GET и POST -> 401', async () => {
    expect((await getCatalog()).status).toBe(401);
    expect((await copy('2')).status).toBe(401);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('без команды: GET и POST -> 403, роль и песни не запрашиваются', async () => {
    getUserTeamIdMock.mockResolvedValue(null);
    const cookie = await sessionCookie();

    expect((await getCatalog(cookie)).status).toBe(403);
    expect((await copy('2', cookie)).status).toBe(403);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('роль "Чтец": GET и POST -> 403, песни не читаются и не создаются', async () => {
    const cookie = await sessionCookie();
    directusWithSongs(catalogRows());

    mockRole('Чтец');
    expect((await getCatalog(cookie)).status).toBe(403);
    mockRole('Чтец');
    expect((await copy('2', cookie)).status).toBe(403);

    // Единственные вызовы — резолв роли.
    expect(adminRequestMock).toHaveBeenCalledTimes(2);
  });

  it('роль "musician" (сетлисты, но не песни) -> 403', async () => {
    mockRole('musician');
    expect((await getCatalog(await sessionCookie())).status).toBe(403);
  });
});

describe('GET /api/catalog', () => {
  it('musician_editor -> 200: только опубликованные public-песни других команд, по названию', async () => {
    mockRole('musician_editor');
    directusWithSongs(catalogRows());

    const res = await getCatalog(await sessionCookie());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      songs: [
        { id: '3', title: 'Аллилуйя', teamName: 'Церковь Б', copiedAs: '40' },
        { id: '2', title: 'Благодать', teamName: 'Церковь Б' },
      ],
    });
  });

  it('team в query не меняет команду: своя всё равно не в каталоге', async () => {
    mockRole('musician_editor');
    directusWithSongs(catalogRows());

    const res = await getCatalog(await sessionCookie(), '?team=team-b');

    const { songs } = await res.json();
    expect(songs.map((song: { id: string }) => song.id)).toEqual(['3', '2']);
  });

  it('сбой Directus -> 500', async () => {
    mockRole('musician_editor');
    adminRequestMock.mockRejectedValue(new Error('directus down'));
    expect((await getCatalog(await sessionCookie())).status).toBe(500);
  });
});

describe('POST /api/catalog/:id/copy', () => {
  it('musician_editor -> 201 { id }, копия в команде сессии, team из тела и query игнорируется', async () => {
    mockRole('musician_editor');
    directusWithSongs(catalogRows());

    const res = await copy('2', await sessionCookie(), { team: 'team-b' }, '?team=team-b');

    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(typeof id).toBe('number');
    expect(createdSongs()).toHaveLength(1);
    expect(createdSongs()[0]).toMatchObject({
      title: 'Благодать',
      content: '[G]Слава',
      team: 'team-a',
      origin_song: 2,
      visibility: 'members',
      status: 'published',
    });
  });

  it('повторная копия -> 409 { id } нашей копии, новая не создаётся', async () => {
    mockRole('musician_editor');
    directusWithSongs(catalogRows());

    const res = await copy('3', await sessionCookie());

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ id: 40 });
    expect(createdSongs()).toHaveLength(0);
  });

  it.each([
    ['своя команда', '1'],
    ['закрытая', '4'],
    ['неопубликованная', '5'],
    ['несуществующая', '999'],
  ])('%s -> 404, копия не создаётся', async (_name, id) => {
    mockRole('musician_editor');
    directusWithSongs(catalogRows());

    expect((await copy(id, await sessionCookie())).status).toBe(404);
    expect(createdSongs()).toHaveLength(0);
  });

  it.each(['abc', '0', '-1', '1.5'])('невалидный id %s -> 400', async (id) => {
    mockRole('musician_editor');
    expect((await copy(id, await sessionCookie())).status).toBe(400);
    // Единственный вызов — резолв роли.
    expect(adminRequestMock).toHaveBeenCalledTimes(1);
  });

  it('сбой Directus -> 500', async () => {
    mockRole('musician_editor');
    adminRequestMock.mockRejectedValue(new Error('directus down'));
    expect((await copy('2', await sessionCookie())).status).toBe(500);
  });
});
