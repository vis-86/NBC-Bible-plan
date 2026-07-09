import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  checkRateLimitMock,
  adminRequestMock,
  getUserByTelegramIdMock,
  verifyTelegramMock,
  registrationState,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  adminRequestMock: vi.fn(),
  getUserByTelegramIdMock: vi.fn(),
  verifyTelegramMock: vi.fn(),
  registrationState: { open: true },
}));

vi.mock('../../../src/lib/rate-limiter', () => ({
  checkRateLimit: checkRateLimitMock,
  clientIp: () => 'test-ip',
}));
vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));
vi.mock('../../../src/lib/directus-user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/directus-user')>();
  return { ...actual, getUserByTelegramId: getUserByTelegramIdMock };
});
vi.mock('../../../src/lib/telegram-server', () => ({
  verifyTelegramInitData: verifyTelegramMock,
}));
vi.mock('../../../src/lib/register-access', () => ({
  isRegistrationOpen: () => registrationState.open,
  isChurchCodeRequired: () => false,
  verifyChurchCode: () => true,
}));

import { createApp } from '../app';

const SESSION_COOKIE = 'bible-plan-session=';

/** Directus: /auth/login ok + /users/me отдаёт только id (роль «Чтец»). */
function mockDirectusFetch(opts: { loginOk?: boolean } = {}) {
  const { loginOk = true } = opts;
  return vi.fn(async (url: string) => {
    if (String(url).endsWith('/auth/login')) {
      if (!loginOk) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ errors: [{ message: 'Invalid user credentials.' }] }),
        } as Response;
      }
      return { ok: true, json: async () => ({ data: { access_token: 'tok' } }) } as Response;
    }
    if (String(url).endsWith('/users/me')) {
      return { ok: true, json: async () => ({ data: { id: 'user-1' } }) } as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function post(path: string, body: unknown) {
  return createApp().request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('bff auth routes', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset().mockReturnValue(true);
    adminRequestMock.mockReset();
    getUserByTelegramIdMock.mockReset();
    verifyTelegramMock.mockReset();
    registrationState.open = true;
  });

  it('login happy-path: 200, Set-Cookie, имя из admin-клиента', async () => {
    vi.stubGlobal('fetch', mockDirectusFetch());
    adminRequestMock.mockResolvedValue([
      { first_name: 'Иван', last_name: 'Петров', email: 'ivan_nbc@local.baptistnn.ru' },
    ]);

    const res = await post('/app/api/auth/login', { login: 'ivan_nbc', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toContain(SESSION_COOKIE);

    const json = (await res.json()) as { user: { directus_id: string; first_name: string } };
    expect(json.user).toMatchObject({ directus_id: 'user-1', first_name: 'Иван' });
  });

  it('login с неверным паролем -> 401 без Set-Cookie', async () => {
    vi.stubGlobal('fetch', mockDirectusFetch({ loginOk: false }));

    const res = await post('/app/api/auth/login', { login: 'ivan_nbc', password: 'wrongpass1' });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('login rate limit -> 429', async () => {
    checkRateLimitMock.mockReturnValue(false);
    const res = await post('/app/api/auth/login', { login: 'ivan_nbc', password: 'secret123' });
    expect(res.status).toBe(429);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('register при закрытой регистрации -> 503', async () => {
    registrationState.open = false;
    const res = await post('/app/api/auth/register', {
      login: 'newuser',
      password: 'secret123',
      displayName: 'Новый',
    });
    expect(res.status).toBe(503);
  });

  it('telegram unlinked -> 200 { linked: false } без Set-Cookie', async () => {
    verifyTelegramMock.mockReturnValue({
      valid: true,
      user: { id: 12345, first_name: 'Tg' },
    });
    getUserByTelegramIdMock.mockResolvedValue(null);

    const res = await post('/app/api/auth/telegram', { initData: 'tg-init-data' });
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toEqual({ linked: false });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('logout -> 200 + истекающий cookie', async () => {
    const res = await post('/app/api/auth/logout', {});
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0');
  });
});
