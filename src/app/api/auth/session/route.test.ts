import { describe, it, expect, vi, beforeEach } from 'vitest';

// Хойстим моки — vi.mock-фабрики поднимаются в начало файла.
const { getSessionMock, createSessionMock, adminRequestMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  // createSession возвращает переданный response — сессия запечатывается в него.
  createSessionMock: vi.fn(async (_d: unknown, res: unknown) => res),
  adminRequestMock: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: getSessionMock,
  createSession: createSessionMock,
}));
vi.mock('@/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));

import { GET } from './route';

const staleSession = {
  directus_id: 'user-1',
  first_name: '',
  last_name: undefined,
  username: 'ivan_nbc@local.baptistnn.ru',
};

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    createSessionMock.mockClear();
    adminRequestMock.mockReset();
  });

  it('user: null без сессии, Directus не трогаем', async () => {
    getSessionMock.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).user).toBeNull();
    expect(adminRequestMock).not.toHaveBeenCalled();
  });

  it('освежает first_name из Directus, когда в cookie он пустой', async () => {
    // Регрессия: сессии, созданные до заполнения имени в Directus,
    // навсегда отдавали first_name='' — приветствие оставалось без имени.
    getSessionMock.mockResolvedValue(staleSession);
    adminRequestMock.mockResolvedValue([
      { first_name: 'Иван', last_name: 'Петров', email: 'ivan_nbc@local.baptistnn.ru' },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({
      directus_id: 'user-1',
      first_name: 'Иван',
      last_name: 'Петров',
    });

    // Cookie пере-запечатывается со свежим профилем.
    const [sessionData] = createSessionMock.mock.calls[0];
    expect(sessionData).toMatchObject({ directus_id: 'user-1', first_name: 'Иван' });
  });

  it('не пере-запечатывает cookie, если профиль не изменился', async () => {
    getSessionMock.mockResolvedValue({ ...staleSession, first_name: 'Иван' });
    adminRequestMock.mockResolvedValue([
      { first_name: 'Иван', last_name: null, email: 'ivan_nbc@local.baptistnn.ru' },
    ]);

    const res = await GET();
    expect((await res.json()).user.first_name).toBe('Иван');
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('отдаёт данные из cookie, если Directus недоступен', async () => {
    getSessionMock.mockResolvedValue({ ...staleSession, first_name: 'Иван' });
    adminRequestMock.mockRejectedValue(new Error('directus down'));

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).user.first_name).toBe('Иван');
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
