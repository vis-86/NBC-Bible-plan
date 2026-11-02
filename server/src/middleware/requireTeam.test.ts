import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserTeamIdMock } = vi.hoisted(() => ({ getUserTeamIdMock: vi.fn() }));

vi.mock('../../../src/lib/teams', () => ({
  getUserTeamId: getUserTeamIdMock,
}));

import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { requireTeam } from './requireTeam';

async function sessionCookie(): Promise<string> {
  const sealed = await sealSession({ directus_id: 'user-1', first_name: 'Test' });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

function testApp() {
  const app = new Hono();
  app.get('/team', requireTeam, (c) => c.json({ teamId: c.get('teamId') }));
  return app;
}

describe('requireTeam', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
    getUserTeamIdMock.mockReset();
  });

  it('без сессии -> 401, членство не запрашивается', async () => {
    const res = await testApp().request('/team');
    expect(res.status).toBe(401);
    expect(getUserTeamIdMock).not.toHaveBeenCalled();
  });

  it('нет членства -> 403', async () => {
    getUserTeamIdMock.mockResolvedValueOnce(null);
    const res = await testApp().request('/team', { headers: { Cookie: await sessionCookie() } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'No team' });
  });

  it('сбой Directus -> 503', async () => {
    getUserTeamIdMock.mockRejectedValueOnce(new Error('directus down'));
    const res = await testApp().request('/team', { headers: { Cookie: await sessionCookie() } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Upstream unavailable' });
  });

  it('есть команда -> 200, teamId доступен в хендлере', async () => {
    getUserTeamIdMock.mockResolvedValueOnce('team-7');
    const res = await testApp().request('/team', { headers: { Cookie: await sessionCookie() } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ teamId: 'team-7' });
  });

  it('команда ищется по directus_id из сессии', async () => {
    getUserTeamIdMock.mockResolvedValueOnce('team-7');
    await testApp().request('/team?team=other', { headers: { Cookie: await sessionCookie() } });
    expect(getUserTeamIdMock).toHaveBeenCalledWith('user-1');
  });
});
