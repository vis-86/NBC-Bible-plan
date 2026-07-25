import { beforeEach, describe, expect, it, vi } from 'vitest';

const { proxyToDirectusMock } = vi.hoisted(() => ({
  proxyToDirectusMock: vi.fn(),
}));

vi.mock('../../../src/lib/directus-proxy', () => ({
  proxyToDirectus: proxyToDirectusMock,
}));

import { createApp } from '../app';

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  process.env.NEXT_PUBLIC_AI_ENABLE = 'true';
  proxyToDirectusMock.mockReset();
  proxyToDirectusMock.mockResolvedValue(new Response('{}', { status: 200 }));
});

describe('ai routes — авторизация', () => {
  it('без сессии -> 401, AI-flow не триггерится', async () => {
    const app = createApp();
    const res = await app.request('/app/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(res.status).toBe(401);
    expect(proxyToDirectusMock).not.toHaveBeenCalled();
  });

  it('AI выключен -> 403 раньше проверки сессии', async () => {
    process.env.NEXT_PUBLIC_AI_ENABLE = 'false';
    const app = createApp();
    const res = await app.request('/app/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(res.status).toBe(403);
    expect(proxyToDirectusMock).not.toHaveBeenCalled();
  });
});
