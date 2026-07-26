import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminRequestMock } = vi.hoisted(() => ({ adminRequestMock: vi.fn() }));

vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));

import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { createApp } from '../app';

async function sessionCookie(): Promise<string> {
  const sealed = await sealSession({ directus_id: 'user-1', first_name: 'Test' });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
});

describe('user routes — 401 без сессии', () => {
  it.each([
    ['/app/api/user/app-settings', 'GET'],
    ['/app/api/user/progress', 'GET'],
    ['/app/api/user/reading-settings', 'GET'],
    ['/app/api/chat/history?pastor_id=p1', 'GET'],
  ])('%s %s -> 401', async (path, method) => {
    const app = createApp();
    const res = await app.request(path, { method });
    expect(res.status).toBe(401);
  });
});

describe('user routes — валидация тела при наличии сессии', () => {
  it('POST /app-settings с невалидной темой -> 400', async () => {
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/user/app-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ theme: 'purple' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /progress с невалидным day -> 400', async () => {
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/user/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ day: 'x', count: 1 }),
    });
    expect(res.status).toBe(400);
  });
});

describe('chat/history — валидация без сессии', () => {
  it('GET без pastor_id -> 401 (сессия проверяется первой)', async () => {
    const app = createApp();
    const res = await app.request('/app/api/chat/history');
    expect(res.status).toBe(401);
  });
});

describe('GET /user/role', () => {
  beforeEach(() => {
    adminRequestMock.mockReset();
  });

  it('без сессии -> 401', async () => {
    const app = createApp();
    const res = await app.request('/app/api/user/role');
    expect(res.status).toBe(401);
  });

  it('роль "Чтец" -> { role: "reader" }', async () => {
    adminRequestMock.mockResolvedValueOnce({ role: { name: 'Чтец' } });
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/user/role', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'reader' });
  });

  it('роль "musician" -> { role: "musician" }', async () => {
    adminRequestMock.mockResolvedValueOnce({ role: { name: 'musician' } });
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/user/role', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'musician' });
  });

  it('ошибка Directus -> 500', async () => {
    adminRequestMock.mockRejectedValueOnce(new Error('directus down'));
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/user/role', { headers: { Cookie: cookie } });
    expect(res.status).toBe(500);
  });
});
