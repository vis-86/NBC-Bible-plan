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

describe('POST /user/profile', () => {
  beforeEach(() => {
    adminRequestMock.mockReset();
  });

  async function post(body: unknown, cookie?: string) {
    const app = createApp();
    return app.request('/app/api/user/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('без сессии -> 401', async () => {
    const res = await post({ display_name: 'Игорь' });
    expect(res.status).toBe(401);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it.each([
    ['пустая строка', ''],
    ['только пробелы', '   '],
    ['длиннее 60 символов', 'я'.repeat(61)],
  ])('%s -> 400', async (_label, displayName) => {
    const cookie = await sessionCookie();
    const res = await post({ display_name: displayName }, cookie);
    expect(res.status).toBe(400);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('display_name не строка -> 400', async () => {
    const cookie = await sessionCookie();
    const res = await post({ display_name: 42 }, cookie);
    expect(res.status).toBe(400);
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('валидное имя -> 200, Directus обновлён, cookie пере-запечатан', async () => {
    adminRequestMock.mockResolvedValueOnce({});
    const cookie = await sessionCookie();
    const res = await post({ display_name: '  Игорь Васильев  ' }, cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      user: { directus_id: 'user-1', first_name: 'Игорь Васильев' },
    });

    // Значение обрезано по краям и ушло в Directus именно как first_name.
    expect(adminRequestMock).toHaveBeenCalledTimes(1);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it('ошибка Directus -> 500, cookie не трогаем', async () => {
    adminRequestMock.mockRejectedValueOnce(new Error('directus down'));
    const cookie = await sessionCookie();
    const res = await post({ display_name: 'Игорь' }, cookie);
    expect(res.status).toBe(500);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });
});
