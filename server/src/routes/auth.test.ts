import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  checkRateLimitMock,
  adminRequestMock,
  getUserByTelegramIdMock,
  verifyTelegramMock,
  createLocalUserMock,
  linkTelegramToUserMock,
  registrationState,
  getTeamIdBySlugMock,
  findValidInviteMock,
  consumeInviteMock,
  createInviteMock,
  getUserStatusMock,
  setUserPasswordMock,
} = vi.hoisted(() => ({
  getUserStatusMock: vi.fn(),
  setUserPasswordMock: vi.fn(),
  getTeamIdBySlugMock: vi.fn(),
  findValidInviteMock: vi.fn(),
  consumeInviteMock: vi.fn(),
  createInviteMock: vi.fn(),
  createLocalUserMock: vi.fn(),
  linkTelegramToUserMock: vi.fn(),
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
  return {
    ...actual,
    getUserByTelegramId: getUserByTelegramIdMock,
    createLocalUser: createLocalUserMock,
    linkTelegramToUser: linkTelegramToUserMock,
    getUserStatus: getUserStatusMock,
    setUserPassword: setUserPasswordMock,
  };
});
vi.mock('../../../src/lib/telegram-server', () => ({
  verifyTelegramInitData: verifyTelegramMock,
}));
vi.mock('../../../src/lib/teams', () => ({
  NBC_TEAM_SLUG: 'nbc',
  getTeamIdBySlug: getTeamIdBySlugMock,
  addTeamMember: vi.fn(),
}));
vi.mock('../../../src/lib/invite', () => ({
  findValidInvite: findValidInviteMock,
  consumeInvite: consumeInviteMock,
  createInvite: createInviteMock,
}));
vi.mock('../../../src/lib/register-access', () => ({
  isRegistrationOpen: () => registrationState.open,
  isChurchCodeRequired: () => false,
  verifyChurchCode: () => true,
}));

import { createApp } from '../app';
import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';

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
    createLocalUserMock.mockReset().mockResolvedValue('user-new');
    linkTelegramToUserMock.mockReset().mockResolvedValue(undefined);
    registrationState.open = true;
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-bot-token');
    getTeamIdBySlugMock.mockReset().mockResolvedValue('team-nbc');
    findValidInviteMock.mockReset();
    consumeInviteMock.mockReset().mockResolvedValue(undefined);
    createInviteMock.mockReset().mockResolvedValue({ url: 'https://app.test/activate?token=t', token: 't' });
    getUserStatusMock.mockReset().mockResolvedValue('active');
    setUserPasswordMock.mockReset().mockResolvedValue(undefined);
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

  describe('register + привязка Telegram', () => {
    beforeEach(() => {
      adminRequestMock.mockResolvedValue([{ first_name: 'Новый' }]);
    });

    it('без initData → 200 + сессия, привязку не трогает', async () => {
      const res = await post('/app/api/auth/register', { login: 'newuser', password: 'secret123' });
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie') ?? '').toContain(SESSION_COOKIE);
      expect((await res.json()) as object).toMatchObject({ success: true, telegramLinked: false });
      expect(linkTelegramToUserMock).not.toHaveBeenCalled();
    });

    it('валидный initData → tg_id привязан к новому аккаунту', async () => {
      verifyTelegramMock.mockReturnValue({ valid: true, user: { id: 777, first_name: 'Tg' } });

      const res = await post('/app/api/auth/register', {
        login: 'newuser',
        password: 'secret123',
        telegramInitData: 'tg-init-data',
      });
      expect(res.status).toBe(200);
      expect((await res.json()) as object).toMatchObject({ telegramLinked: true });
      expect(linkTelegramToUserMock).toHaveBeenCalledWith('user-new', 777);
    });

    it('невалидный initData → регистрация успешна, без привязки', async () => {
      verifyTelegramMock.mockReturnValue({ valid: false, error: 'bad hash' });

      const res = await post('/app/api/auth/register', {
        login: 'newuser',
        password: 'secret123',
        telegramInitData: 'forged',
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie') ?? '').toContain(SESSION_COOKIE);
      expect((await res.json()) as object).toMatchObject({ telegramLinked: false });
      expect(linkTelegramToUserMock).not.toHaveBeenCalled();
    });

    it('сбой привязки → регистрация всё равно 200 + сессия', async () => {
      verifyTelegramMock.mockReturnValue({ valid: true, user: { id: 777, first_name: 'Tg' } });
      linkTelegramToUserMock.mockRejectedValue(new Error('directus down'));

      const res = await post('/app/api/auth/register', {
        login: 'newuser',
        password: 'secret123',
        telegramInitData: 'tg-init-data',
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie') ?? '').toContain(SESSION_COOKIE);
      expect((await res.json()) as object).toMatchObject({ telegramLinked: false });
    });
  });

  describe('register → команда NBC', () => {
    beforeEach(() => {
      adminRequestMock.mockResolvedValue([{ first_name: 'Новый' }]);
    });

    it('аккаунт создаётся в команде NBC с ролью reader', async () => {
      const res = await post('/app/api/auth/register', { login: 'newuser', password: 'secret123' });
      expect(res.status).toBe(200);
      expect(getTeamIdBySlugMock).toHaveBeenCalledWith('nbc');
      expect(createLocalUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ login: 'newuser', password: 'secret123', teamId: 'team-nbc' }),
      );
      expect([undefined, 'reader']).toContain(createLocalUserMock.mock.calls[0][0].appRole);
    });

    it('команды NBC нет -> 503, аккаунт не создаётся', async () => {
      getTeamIdBySlugMock.mockResolvedValue(null);
      const res = await post('/app/api/auth/register', { login: 'newuser', password: 'secret123' });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'Регистрация временно недоступна' });
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(createLocalUserMock).not.toHaveBeenCalled();
    });

    it('сбой поиска команды -> 503, аккаунт не создаётся', async () => {
      getTeamIdBySlugMock.mockRejectedValue(new Error('directus down'));
      const res = await post('/app/api/auth/register', { login: 'newuser', password: 'secret123' });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'Регистрация временно недоступна' });
      expect(createLocalUserMock).not.toHaveBeenCalled();
    });
  });

  describe('activate по инвайту', () => {
    const body = { token: 'invite-token-123', login: 'newuser', password: 'secret123', displayName: 'Новый' };
    const activateInvite = (patch: object) => ({
      id: 5,
      kind: 'activate',
      user: null,
      team: 'team-choir',
      role: 'musician',
      ...patch,
    });

    beforeEach(() => {
      adminRequestMock.mockResolvedValue([{ first_name: 'Новый' }]);
    });

    it('инвайт с team/role -> аккаунт в этой команде с этой ролью', async () => {
      findValidInviteMock.mockResolvedValue(activateInvite({}));

      const res = await post('/app/api/auth/activate', body);
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie') ?? '').toContain(SESSION_COOKIE);
      expect(createLocalUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ login: 'newuser', teamId: 'team-choir', appRole: 'musician' }),
      );
      expect(consumeInviteMock).toHaveBeenCalledWith(5, 'user-new');
    });

    it('инвайт без team -> тот же ответ, что на недействительную ссылку; аккаунт не создаётся', async () => {
      findValidInviteMock.mockResolvedValue(null);
      const invalid = await post('/app/api/auth/activate', body);

      findValidInviteMock.mockResolvedValue(activateInvite({ team: null }));
      const res = await post('/app/api/auth/activate', body);

      expect(res.status).toBe(invalid.status);
      expect(await res.json()).toEqual(await invalid.json());
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(createLocalUserMock).not.toHaveBeenCalled();
      expect(consumeInviteMock).not.toHaveBeenCalled();
    });

    it.each([
      ['вне списка', 'superuser'],
      ['не задана', null],
    ])('роль %s -> reader', async (_case, role) => {
      findValidInviteMock.mockResolvedValue(activateInvite({ role }));

      const res = await post('/app/api/auth/activate', body);
      expect(res.status).toBe(200);
      expect(createLocalUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-choir', appRole: 'reader' }),
      );
    });

    it('reset-инвайт команды не требует и аккаунт не создаёт', async () => {
      findValidInviteMock.mockResolvedValue({ id: 6, kind: 'reset', user: 'user-9', team: null, role: null });

      const res = await post('/app/api/auth/activate', { token: 'reset-token-123', password: 'secret123' });
      expect(res.status).toBe(200);
      expect(createLocalUserMock).not.toHaveBeenCalled();
      expect(setUserPasswordMock).toHaveBeenCalledWith('user-9', 'secret123');
      expect(consumeInviteMock).toHaveBeenCalledWith(6);
    });

    it.each([
      ['suspended', 'suspended'],
      ['пользователя нет', null],
    ])('reset для неактивного аккаунта (%s) -> ответ как на недействительную ссылку', async (_case, status) => {
      findValidInviteMock.mockResolvedValue(null);
      const invalid = await post('/app/api/auth/activate', { token: 'reset-token-123', password: 'secret123' });

      getUserStatusMock.mockResolvedValue(status);
      findValidInviteMock.mockResolvedValue({ id: 6, kind: 'reset', user: 'user-9', team: null, role: null });
      const res = await post('/app/api/auth/activate', { token: 'reset-token-123', password: 'secret123' });

      expect(res.status).toBe(invalid.status);
      expect(await res.json()).toEqual(await invalid.json());
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(getUserStatusMock).toHaveBeenCalledWith('user-9');
      expect(setUserPasswordMock).not.toHaveBeenCalled();
      expect(consumeInviteMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/invite/create', () => {
    function postInvite(payload: unknown) {
      return createApp().request('/app/api/auth/invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-invite-secret' },
        body: JSON.stringify(payload),
      });
    }

    beforeEach(() => {
      vi.stubEnv('INVITE_ADMIN_SECRET', 'test-invite-secret');
    });

    it('team/role из тела пишутся в инвайт', async () => {
      getTeamIdBySlugMock.mockResolvedValue('team-choir');

      const res = await postInvite({ kind: 'activate', team: 'choir', role: 'musician' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ url: 'https://app.test/activate?token=t', token: 't' });
      expect(getTeamIdBySlugMock).toHaveBeenCalledWith('choir');
      expect(createInviteMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'activate', teamId: 'team-choir', role: 'musician' }),
      );
    });

    it('по умолчанию — команда NBC и роль reader', async () => {
      const res = await postInvite({ kind: 'activate' });
      expect(res.status).toBe(200);
      expect(getTeamIdBySlugMock).toHaveBeenCalledWith('nbc');
      expect(createInviteMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'activate', teamId: 'team-nbc', role: 'reader' }),
      );
    });

    it('неизвестный slug -> 400, инвайт не создаётся', async () => {
      getTeamIdBySlugMock.mockResolvedValue(null);
      const res = await postInvite({ kind: 'activate', team: 'nope' });
      expect(res.status).toBe(400);
      expect(createInviteMock).not.toHaveBeenCalled();
    });

    it('роль вне AppRole -> 400, инвайт не создаётся', async () => {
      const res = await postInvite({ kind: 'activate', role: 'admin' });
      expect(res.status).toBe(400);
      expect(createInviteMock).not.toHaveBeenCalled();
    });

    it('reset — без команды и роли', async () => {
      const res = await postInvite({ kind: 'reset', userId: 'user-9' });
      expect(res.status).toBe(200);
      expect(getTeamIdBySlugMock).not.toHaveBeenCalled();
      expect(createInviteMock).toHaveBeenCalledWith({ kind: 'reset', userId: 'user-9' });
    });
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

  describe('telegram + статус аккаунта', () => {
    beforeEach(() => {
      verifyTelegramMock.mockReturnValue({ valid: true, user: { id: 12345, first_name: 'Tg' } });
      getUserByTelegramIdMock.mockResolvedValue('user-7');
      adminRequestMock.mockResolvedValue([{ first_name: 'Иван' }]);
    });

    it('активный аккаунт -> linked: true + сессия', async () => {
      const res = await post('/app/api/auth/telegram', { initData: 'tg-init-data' });
      expect(res.status).toBe(200);
      expect((await res.json()) as object).toMatchObject({ linked: true });
      expect(res.headers.get('set-cookie') ?? '').toContain(SESSION_COOKIE);
    });

    it.each([
      ['suspended', 'suspended'],
      ['пользователя нет', null],
    ])('аккаунт не active (%s) -> { linked: false } без сессии', async (_case, status) => {
      getUserStatusMock.mockResolvedValue(status);

      const res = await post('/app/api/auth/telegram', { initData: 'tg-init-data' });
      expect(res.status).toBe(200);
      expect((await res.json()) as object).toEqual({ linked: false });
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(getUserStatusMock).toHaveBeenCalledWith('user-7');
    });
  });

  describe('GET /auth/session + статус аккаунта', () => {
    async function getSessionWith(cookie?: string) {
      return createApp().request('/app/api/auth/session', {
        headers: cookie ? { Cookie: cookie } : {},
      });
    }

    async function sessionCookie(): Promise<string> {
      const sealed = await sealSession({ directus_id: 'user-7', first_name: 'Иван' });
      return `${SESSION_COOKIE_NAME}=${sealed}`;
    }

    beforeEach(() => {
      adminRequestMock.mockResolvedValue([{ first_name: 'Иван' }]);
    });

    it('активный аккаунт -> пользователь в ответе', async () => {
      const res = await getSessionWith(await sessionCookie());
      expect(res.status).toBe(200);
      expect((await res.json()) as object).toMatchObject({ user: { directus_id: 'user-7' } });
      expect(res.headers.get('set-cookie') ?? '').not.toContain('Max-Age=0');
    });

    it.each([
      ['suspended', 'suspended'],
      ['пользователя нет', null],
    ])('аккаунт не active (%s) -> cookie снят, ответ как без сессии', async (_case, status) => {
      const anonymous = await getSessionWith();

      getUserStatusMock.mockResolvedValue(status);
      const res = await getSessionWith(await sessionCookie());

      expect(res.status).toBe(anonymous.status);
      expect(await res.json()).toEqual(await anonymous.json());
      expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0');
      expect(getUserStatusMock).toHaveBeenCalledWith('user-7');
    });

    it('сбой Directus при чтении статуса -> сессия остаётся', async () => {
      getUserStatusMock.mockRejectedValue(new Error('directus down'));

      const res = await getSessionWith(await sessionCookie());
      expect(res.status).toBe(200);
      expect((await res.json()) as object).toMatchObject({ user: { directus_id: 'user-7' } });
      expect(res.headers.get('set-cookie') ?? '').not.toContain('Max-Age=0');
    });
  });

  it('logout -> 200 + истекающий cookie', async () => {
    const res = await post('/app/api/auth/logout', {});
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0');
  });
});
