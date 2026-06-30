import { describe, it, expect, vi, beforeEach } from 'vitest';

// Хойстим моки и реальный класс ошибки (нужен для `instanceof LoginTakenError`
// в роуте) — vi.mock-фабрики поднимаются в начало файла.
const {
  checkRateLimitMock,
  isRegistrationOpenMock,
  verifyChurchCodeMock,
  createLocalUserMock,
  createSessionMock,
  LoginTakenError,
} = vi.hoisted(() => {
  class LoginTakenError extends Error {
    constructor(login: string) {
      super(`Login already taken: ${login}`);
      this.name = 'LoginTakenError';
    }
  }
  return {
    checkRateLimitMock: vi.fn(),
    isRegistrationOpenMock: vi.fn(),
    verifyChurchCodeMock: vi.fn(),
    createLocalUserMock: vi.fn(),
    createSessionMock: vi.fn(async (_d: unknown, res: unknown) => res),
    LoginTakenError,
  };
});

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: checkRateLimitMock,
  clientIp: () => 'test-ip',
}));
vi.mock('@/lib/register-access', () => ({
  isRegistrationOpen: isRegistrationOpenMock,
  verifyChurchCode: verifyChurchCodeMock,
}));
vi.mock('@/lib/directus-user', () => ({
  createLocalUser: createLocalUserMock,
  LoginTakenError,
}));
vi.mock('@/lib/session', () => ({
  createSession: createSessionMock,
}));
vi.mock('@/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: async () => [{ first_name: 'Иван' }] }),
}));

import { POST } from './route';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

const validBody = { login: 'ivan_nbc', displayName: 'Иван', password: 'secret123', churchCode: 'church-2026' };

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset().mockReturnValue(true);
    isRegistrationOpenMock.mockReset().mockReturnValue(true);
    verifyChurchCodeMock.mockReset().mockReturnValue(true);
    createLocalUserMock.mockReset().mockResolvedValue('user-1');
    createSessionMock.mockClear();
  });

  it('creates an account and a session on valid input (200)', async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.directus_id).toBe('user-1');
    expect(createSessionMock).toHaveBeenCalledOnce();
  });

  it('returns 429 when rate limited (before any other check)', async () => {
    checkRateLimitMock.mockReturnValue(false);
    const res = await POST(req(validBody));
    expect(res.status).toBe(429);
    expect(isRegistrationOpenMock).not.toHaveBeenCalled();
  });

  it('returns 503 when registration is closed', async () => {
    isRegistrationOpenMock.mockReturnValue(false);
    const res = await POST(req(validBody));
    expect(res.status).toBe(503);
  });

  it('returns 400 on invalid body (missing churchCode)', async () => {
    const res = await POST(req({ login: 'ivan_nbc', displayName: 'Иван', password: 'secret123' }));
    expect(res.status).toBe(400);
    expect(verifyChurchCodeMock).not.toHaveBeenCalled();
  });

  it('returns 403 on wrong church code', async () => {
    verifyChurchCodeMock.mockReturnValue(false);
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(createLocalUserMock).not.toHaveBeenCalled();
  });

  it('returns 409 when login is taken', async () => {
    createLocalUserMock.mockRejectedValue(new LoginTakenError('ivan_nbc'));
    const res = await POST(req(validBody));
    expect(res.status).toBe(409);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
