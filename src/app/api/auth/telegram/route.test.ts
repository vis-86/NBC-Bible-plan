import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем верификацию Telegram и lookup пользователя.
const verifyMock = vi.fn();
const getUserByTelegramIdMock = vi.fn();

vi.mock('@/lib/telegram-server', () => ({
  verifyTelegramInitData: (...a: unknown[]) => verifyMock(...a),
}));
vi.mock('@/lib/directus-user', () => ({
  getUserByTelegramId: (...a: unknown[]) => getUserByTelegramIdMock(...a),
}));
vi.mock('@/lib/session', () => ({
  createSession: vi.fn(async (_d: unknown, res: unknown) => res),
}));
vi.mock('@/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: async () => [{ first_name: 'Иван' }] }),
}));

import { POST } from './route';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/telegram', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/auth/telegram', () => {
  beforeEach(() => {
    verifyMock.mockReset();
    getUserByTelegramIdMock.mockReset();
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  });

  it('returns linked:false and does NOT create a session for an unknown tg_id', async () => {
    verifyMock.mockReturnValue({ valid: true, user: { id: 555, first_name: 'Аноним' } });
    getUserByTelegramIdMock.mockResolvedValue(null);

    const res = await POST(req({ initData: 'x' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.linked).toBe(false);
    expect(json.success).toBeUndefined();
  });

  it('returns linked:true for a known tg_id', async () => {
    verifyMock.mockReturnValue({ valid: true, user: { id: 555, first_name: 'Аноним' } });
    getUserByTelegramIdMock.mockResolvedValue('user-1');

    const res = await POST(req({ initData: 'x' }));
    const json = await res.json();
    expect(json.linked).toBe(true);
    expect(json.user.directus_id).toBe('user-1');
  });

  it('rejects invalid initData', async () => {
    verifyMock.mockReturnValue({ valid: false, error: 'bad' });
    const res = await POST(req({ initData: 'x' }));
    expect(res.status).toBe(401);
  });
});
