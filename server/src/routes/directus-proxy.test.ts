import { beforeEach, describe, expect, it, vi } from 'vitest';

const { proxyToDirectusMock } = vi.hoisted(() => ({
  proxyToDirectusMock: vi.fn(),
}));

vi.mock('../../../src/lib/directus-proxy', () => ({
  proxyToDirectus: proxyToDirectusMock,
}));

import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { createApp } from '../app';

async function sessionCookie(): Promise<string> {
  const sealed = await sealSession({ directus_id: 'user-1', first_name: 'Test' });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  proxyToDirectusMock.mockReset();
  proxyToDirectusMock.mockResolvedValue(new Response('{}', { status: 200 }));
});

describe('directus proxy — авторизация', () => {
  it('без сессии -> 401, в Directus не ходит', async () => {
    const app = createApp();
    const res = await app.request('/app/api/directus/users?fields=id');
    expect(res.status).toBe(401);
    expect(proxyToDirectusMock).not.toHaveBeenCalled();
  });

  it('заголовок x-use-admin-token без сессии НЕ даёт обхода -> 401', async () => {
    const app = createApp();
    const res = await app.request('/app/api/directus/users?fields=id', {
      headers: { 'x-use-admin-token': 'true' },
    });
    expect(res.status).toBe(401);
    expect(proxyToDirectusMock).not.toHaveBeenCalled();
  });

  it('с сессией проксирует БЕЗ admin-токена, даже если прислан заголовок', async () => {
    const app = createApp();
    const cookie = await sessionCookie();
    const res = await app.request('/app/api/directus/items/setlists', {
      headers: { Cookie: cookie, 'x-use-admin-token': 'true' },
    });
    expect(res.status).toBe(200);
    expect(proxyToDirectusMock).toHaveBeenCalledTimes(1);
    // третий аргумент useAdminToken обязан быть false
    expect(proxyToDirectusMock.mock.calls[0][2]).toBe(false);
    // служебный заголовок не должен уйти в Directus
    const forwardedReq = proxyToDirectusMock.mock.calls[0][1] as Request;
    expect(forwardedReq.headers.get('x-use-admin-token')).toBeNull();
  });
});
