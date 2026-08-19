import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminRequestMock, getReadingPlanMock } = vi.hoisted(() => ({
  adminRequestMock: vi.fn(),
  getReadingPlanMock: vi.fn(),
}));

vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));
vi.mock('../../../src/lib/directus-data', () => ({
  getReadingPlan: getReadingPlanMock,
  getWeeklyPlanItems: vi.fn(),
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

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  adminRequestMock.mockReset();
  getReadingPlanMock.mockReset();
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
});
