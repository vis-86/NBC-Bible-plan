import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminRequestMock } = vi.hoisted(() => ({ adminRequestMock: vi.fn() }));

vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));

import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { requireSetlistWrite, requireSongWrite, requireTeamAdmin } from './requireRole';

async function sessionCookie(): Promise<string> {
  const sealed = await sealSession({ directus_id: 'user-1', first_name: 'Test' });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

function testApp(gate = requireSetlistWrite) {
  const app = new Hono();
  app.post('/write', gate, (c) => c.json({ role: c.get('appRole') }));
  return app;
}

describe('requireSetlistWrite', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
    adminRequestMock.mockReset();
  });

  it('без сессии -> 401', async () => {
    const app = testApp();
    const res = await app.request('/write', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('роль "Чтец" -> 403', async () => {
    adminRequestMock.mockResolvedValueOnce({ role: { name: 'Чтец' } });
    const cookie = await sessionCookie();
    const app = testApp();
    const res = await app.request('/write', { method: 'POST', headers: { Cookie: cookie } });
    expect(res.status).toBe(403);
  });

  it('роль "musician" -> проходит, appRole доступна в хендлере', async () => {
    adminRequestMock.mockResolvedValueOnce({ role: { name: 'musician' } });
    const cookie = await sessionCookie();
    const app = testApp();
    const res = await app.request('/write', { method: 'POST', headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'musician' });
  });
});

describe('requireSongWrite', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
    adminRequestMock.mockReset();
  });

  it('без сессии -> 401', async () => {
    const app = testApp(requireSongWrite);
    const res = await app.request('/write', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('роль "musician" правит сетлисты, но не песни -> 403', async () => {
    adminRequestMock.mockResolvedValueOnce({ role: { name: 'musician' } });
    const cookie = await sessionCookie();
    const app = testApp(requireSongWrite);
    const res = await app.request('/write', { method: 'POST', headers: { Cookie: cookie } });
    expect(res.status).toBe(403);
  });

  it('роль "musician_editor" -> проходит', async () => {
    adminRequestMock.mockResolvedValueOnce({ role: { name: 'musician_editor' } });
    const cookie = await sessionCookie();
    const app = testApp(requireSongWrite);
    const res = await app.request('/write', { method: 'POST', headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'musician_editor' });
  });
});

describe('requireTeamAdmin', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
    adminRequestMock.mockReset();
  });

  it('без сессии -> 401', async () => {
    const app = testApp(requireTeamAdmin);
    const res = await app.request('/write', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it.each(['Чтец', 'musician', 'musician_editor'])('роль "%s" -> 403', async (roleName) => {
    adminRequestMock.mockResolvedValueOnce({ role: { name: roleName } });
    const cookie = await sessionCookie();
    const app = testApp(requireTeamAdmin);
    const res = await app.request('/write', { method: 'POST', headers: { Cookie: cookie } });
    expect(res.status).toBe(403);
  });

  it('роль "team_admin" -> проходит', async () => {
    adminRequestMock.mockResolvedValueOnce({ role: { name: 'team_admin' } });
    const cookie = await sessionCookie();
    const app = testApp(requireTeamAdmin);
    const res = await app.request('/write', { method: 'POST', headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'team_admin' });
  });
});

describe('team_admin на гейтах записи', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
    adminRequestMock.mockReset();
  });

  it.each([
    ['requireSetlistWrite', requireSetlistWrite],
    ['requireSongWrite', requireSongWrite],
  ])('%s пропускает team_admin', async (_name, gate) => {
    adminRequestMock.mockResolvedValueOnce({ role: { name: 'team_admin' } });
    const cookie = await sessionCookie();
    const app = testApp(gate);
    const res = await app.request('/write', { method: 'POST', headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
  });
});
