import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminRequestMock, getReadingPlanMock, getUserTeamIdMock } = vi.hoisted(() => ({
  adminRequestMock: vi.fn(),
  getReadingPlanMock: vi.fn(),
  getUserTeamIdMock: vi.fn(),
}));

vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));
vi.mock('../../../src/lib/directus-data', () => ({
  getReadingPlan: getReadingPlanMock,
  getWeeklyPlanItems: vi.fn(),
}));
vi.mock('../../../src/lib/teams', () => ({
  getUserTeamId: getUserTeamIdMock,
}));

import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { createApp } from '../app';
import { __resetSyncCacheForTests } from './sync';

async function sessionCookie(directusId = 'user-1'): Promise<string> {
  const sealed = await sealSession({ directus_id: directusId, first_name: 'Test' });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

/**
 * Порядок вызовов Directus внутри манифеста: songs (версии), setlists, setlist_items.
 * Плановая часть идёт через замоканный `getReadingPlan`.
 */
function mockDirectusOk(options: { songId?: number; setlistId?: string } = {}) {
  const songId = options.songId ?? 1;
  const setlistId = options.setlistId ?? 's1';
  adminRequestMock.mockReset();
  adminRequestMock
    .mockResolvedValueOnce([{ id: songId, date_updated: '2026-08-01T10:00:00Z', date_created: null }])
    .mockResolvedValueOnce([{ id: setlistId, date_updated: '2026-08-02T10:00:00Z', date_created: null }])
    .mockResolvedValueOnce([{ id: 'i1', setlist: setlistId, song: songId, sort: 0 }]);
  getReadingPlanMock.mockResolvedValue([{ id: 1, numbers: 1, item: 1, read: 'Быт 1' }]);
}

type DirectusCommand = () => { path: string; params?: { filter?: { team?: { _eq?: string } } } };

/** Песни двух команд; версии песен фильтруются по `team`, как в настоящем Directus. */
function mockDirectusTwoTeams() {
  const songs = [
    { id: 1, team: 'team-a', date_updated: '2026-08-01T10:00:00Z', date_created: null },
    { id: 2, team: 'team-b', date_updated: '2026-08-03T10:00:00Z', date_created: null },
  ];
  adminRequestMock.mockImplementation(async (command: DirectusCommand) => {
    const { path, params } = command();
    if (path === '/items/songs') {
      const team = params?.filter?.team?._eq;
      return songs.filter((row) => team === undefined || row.team === team);
    }
    if (path === '/items/setlists' || path === '/items/setlist_items') return [];
    throw new Error(`unexpected Directus call ${path}`);
  });
  getReadingPlanMock.mockResolvedValue([{ id: 1, numbers: 1, item: 1, read: 'Быт 1' }]);
  getUserTeamIdMock.mockImplementation(async (directusId: string) =>
    directusId === 'user-a' ? 'team-a' : directusId === 'user-b' ? 'team-b' : null,
  );
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  adminRequestMock.mockReset();
  getReadingPlanMock.mockReset();
  getUserTeamIdMock.mockReset();
  getUserTeamIdMock.mockResolvedValue('team-a');
  __resetSyncCacheForTests();
});

describe('GET /api/sync/manifest', () => {
  it('без сессии -> 401', async () => {
    const app = createApp();
    const res = await app.request('/app/api/sync/manifest');
    expect(res.status).toBe(401);
  });

  it('форма ответа: пер-элементные версии песен и сетов + версия плана', async () => {
    mockDirectusOk();
    const app = createApp();
    const res = await app.request('/app/api/sync/manifest', {
      headers: { cookie: await sessionCookie() },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('ETag')).toBeTruthy();

    const body = (await res.json()) as { songs: [string, string][]; setlists: [string, string][]; plan: string };
    expect(body.songs).toEqual([['1', '2026-08-01T10:00:00Z']]);
    expect(body.setlists).toHaveLength(1);
    expect(body.setlists[0][0]).toBe('s1');
    expect(body.setlists[0][1]).toMatch(/^[0-9a-f]{12}$/);
    expect(body.plan).toMatch(/^[0-9a-f]{12}$/);
  });

  it('версия сета меняется при правке ТОЛЬКО состава (date_updated сета прежний)', async () => {
    mockDirectusOk();
    const app = createApp();
    const cookie = await sessionCookie();
    const first = await app.request('/app/api/sync/manifest', { headers: { cookie } });
    const firstBody = (await first.json()) as { setlists: [string, string][] };

    // Тот же сет с тем же date_updated, но другой состав.
    __resetSyncCacheForTests();
    adminRequestMock.mockReset();
    adminRequestMock
      .mockResolvedValueOnce([{ id: 1, date_updated: '2026-08-01T10:00:00Z', date_created: null }])
      .mockResolvedValueOnce([{ id: 's1', date_updated: '2026-08-02T10:00:00Z', date_created: null }])
      .mockResolvedValueOnce([
        { id: 'i1', setlist: 's1', song: 1, sort: 0 },
        { id: 'i2', setlist: 's1', song: 2, sort: 1 },
      ]);

    const second = await app.request('/app/api/sync/manifest', { headers: { cookie } });
    const secondBody = (await second.json()) as { setlists: [string, string][] };

    expect(secondBody.setlists[0][1]).not.toBe(firstBody.setlists[0][1]);
  });

  it('совпавший If-None-Match -> 304 без тела', async () => {
    mockDirectusOk();
    const app = createApp();
    const cookie = await sessionCookie();

    const first = await app.request('/app/api/sync/manifest', { headers: { cookie } });
    const etag = first.headers.get('ETag')!;

    const second = await app.request('/app/api/sync/manifest', {
      headers: { cookie, 'If-None-Match': etag },
    });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('расхождение ETag -> 200 с телом', async () => {
    mockDirectusOk();
    const app = createApp();
    const res = await app.request('/app/api/sync/manifest', {
      headers: { cookie: await sessionCookie(), 'If-None-Match': '"stale"' },
    });

    expect(res.status).toBe(200);
    expect((await res.json()) as { songs: unknown[] }).toHaveProperty('songs');
  });

  it('in-memory кеш: второй запрос не ходит в Directus повторно', async () => {
    mockDirectusOk();
    const app = createApp();
    const cookie = await sessionCookie();

    await app.request('/app/api/sync/manifest', { headers: { cookie } });
    const callsAfterFirst = adminRequestMock.mock.calls.length;

    await app.request('/app/api/sync/manifest', { headers: { cookie } });

    expect(adminRequestMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('падение Directus -> 503, а НЕ пустой манифест', async () => {
    adminRequestMock.mockRejectedValue(new Error('Directus down'));
    getReadingPlanMock.mockRejectedValue(new Error('Directus down'));

    const app = createApp();
    const res = await app.request('/app/api/sync/manifest', {
      headers: { cookie: await sessionCookie() },
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; songs?: unknown };
    expect(body.songs).toBeUndefined();
  });

  it('без команды -> 403, Directus не запрашивается', async () => {
    getUserTeamIdMock.mockResolvedValue(null);
    const res = await createApp().request('/app/api/sync/manifest', {
      headers: { cookie: await sessionCookie() },
    });
    expect(res.status).toBe(403);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('две команды получают разные манифесты — только свои песни', async () => {
    mockDirectusTwoTeams();
    const app = createApp();

    const a = await app.request('/app/api/sync/manifest', { headers: { cookie: await sessionCookie('user-a') } });
    const b = await app.request('/app/api/sync/manifest', { headers: { cookie: await sessionCookie('user-b') } });

    expect(((await a.json()) as { songs: [string, string][] }).songs).toEqual([['1', '2026-08-01T10:00:00Z']]);
    expect(((await b.json()) as { songs: [string, string][] }).songs).toEqual([['2', '2026-08-03T10:00:00Z']]);
    expect(a.headers.get('ETag')).not.toBe(b.headers.get('ETag'));
  });

  it('кеш одной команды не отдаётся другой, а своей — отдаётся', async () => {
    mockDirectusTwoTeams();
    const app = createApp();
    const cookieA = await sessionCookie('user-a');

    await app.request('/app/api/sync/manifest', { headers: { cookie: cookieA } });
    const callsAfterA = adminRequestMock.mock.calls.length;

    const b = await app.request('/app/api/sync/manifest', { headers: { cookie: await sessionCookie('user-b') } });
    expect(adminRequestMock.mock.calls.length).toBeGreaterThan(callsAfterA);
    expect(((await b.json()) as { songs: [string, string][] }).songs.map(([id]) => id)).toEqual(['2']);

    const callsAfterB = adminRequestMock.mock.calls.length;
    const again = await app.request('/app/api/sync/manifest', { headers: { cookie: cookieA } });
    expect(adminRequestMock.mock.calls.length).toBe(callsAfterB);
    expect(((await again.json()) as { songs: [string, string][] }).songs.map(([id]) => id)).toEqual(['1']);
  });

  it('версии сетов — только сеты своей команды и их позиции', async () => {
    const setlists = [
      { id: 'set-a', team: 'team-a', date_updated: '2026-08-02T10:00:00Z', date_created: null },
      { id: 'set-b', team: 'team-b', date_updated: '2026-08-02T10:00:00Z', date_created: null },
    ];
    const items = [
      { id: 'ia', setlist: 'set-a', song: 1, sort: 0 },
      { id: 'ib', setlist: 'set-b', song: 2, sort: 0 },
    ];
    type Filter = { team?: { _eq?: string }; setlist?: { team?: { _eq?: string } } };
    adminRequestMock.mockImplementation(async (command: () => { path: string; params?: { filter?: Filter } }) => {
      const { path, params } = command();
      if (path === '/items/songs') return [];
      if (path === '/items/setlists') {
        return setlists.filter((row) => row.team === params?.filter?.team?._eq);
      }
      if (path === '/items/setlist_items') {
        const team = params?.filter?.setlist?.team?._eq;
        return items.filter((item) => setlists.find((s) => s.id === item.setlist)?.team === team);
      }
      throw new Error(`unexpected Directus call ${path}`);
    });
    getReadingPlanMock.mockResolvedValue([{ id: 1, numbers: 1, item: 1, read: 'Быт 1' }]);
    getUserTeamIdMock.mockImplementation(async (directusId: string) => (directusId === 'user-b' ? 'team-b' : 'team-a'));

    const app = createApp();
    const a = await app.request('/app/api/sync/manifest', { headers: { cookie: await sessionCookie('user-a') } });
    const b = await app.request('/app/api/sync/manifest', { headers: { cookie: await sessionCookie('user-b') } });

    const ids = async (res: Response) =>
      ((await res.json()) as { setlists: [string, string][] }).setlists.map(([id]) => id);
    expect(await ids(a)).toEqual(['set-a']);
    expect(await ids(b)).toEqual(['set-b']);
  });

  it('сбой Directus у одной команды -> 503, а не закешированный манифест другой', async () => {
    mockDirectusTwoTeams();
    const app = createApp();
    await app.request('/app/api/sync/manifest', { headers: { cookie: await sessionCookie('user-a') } });

    adminRequestMock.mockRejectedValue(new Error('Directus down'));
    const res = await app.request('/app/api/sync/manifest', { headers: { cookie: await sessionCookie('user-b') } });

    expect(res.status).toBe(503);
    expect(((await res.json()) as { songs?: unknown }).songs).toBeUndefined();
  });
});
