import { describe, it, expect, vi, beforeEach } from 'vitest';

// Хойстим моки — vi.mock-фабрики поднимаются в начало файла.
const { checkRateLimitMock, createSessionMock, adminRequestMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  // createSession возвращает переданный response — сессия запечатывается в него.
  createSessionMock: vi.fn(async (_d: unknown, res: unknown) => res),
  adminRequestMock: vi.fn(),
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: checkRateLimitMock,
  clientIp: () => 'test-ip',
}));
vi.mock('@/lib/session', () => ({
  createSession: createSessionMock,
}));
vi.mock('@/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));

import { POST } from './route';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

const validBody = { login: 'ivan_nbc', password: 'secret123' };

/**
 * Directus отвечает: /auth/login → access_token; /users/me → ТОЛЬКО { id }
 * (роль «Чтец» через app-access policy $CURRENT_USER не отдаёт first_name).
 */
function mockDirectusFetch(meBody: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/auth/login')) {
      return { ok: true, json: async () => ({ data: { access_token: 'tok' } }) } as Response;
    }
    if (url.endsWith('/users/me')) {
      return { ok: true, json: async () => ({ data: meBody }) } as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset().mockReturnValue(true);
    createSessionMock.mockClear();
    adminRequestMock.mockReset();
  });

  it('подтягивает first_name из admin-клиента, когда /users/me отдаёт только id', async () => {
    // Регрессия: раньше first_name читался из /users/me и оказывался пустым.
    vi.stubGlobal('fetch', mockDirectusFetch({ id: 'user-1' }));
    adminRequestMock.mockResolvedValue([{ first_name: 'Иван', last_name: 'Петров', email: 'ivan_nbc@local.baptistnn.ru' }]);

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);

    const [sessionData] = createSessionMock.mock.calls[0];
    expect(sessionData).toMatchObject({
      directus_id: 'user-1',
      first_name: 'Иван',
      last_name: 'Петров',
    });

    const json = await res.json();
    expect(json.user.first_name).toBe('Иван');
  });

  it('логин не падает, если admin-чтение профиля упало (имя пустое)', async () => {
    vi.stubGlobal('fetch', mockDirectusFetch({ id: 'user-1' }));
    adminRequestMock.mockRejectedValue(new Error('directus down'));

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);

    const [sessionData] = createSessionMock.mock.calls[0];
    expect(sessionData).toMatchObject({ directus_id: 'user-1', first_name: '' });
  });

  it('429 при превышении rate-limit', async () => {
    checkRateLimitMock.mockReturnValue(false);
    const res = await POST(req(validBody));
    expect(res.status).toBe(429);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
