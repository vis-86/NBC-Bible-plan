import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiClientError } from './client';

/**
 * Регрессия: bootstrap темы (ThemeProvider) на публичных страницах (/activate, /login)
 * дёргал /api/user/app-settings без сессии → 401 → глобальный __onSessionExpired →
 * redirect на /login. Invite-ссылка сразу перебрасывала на логин.
 * Фикс: для skipAuth-запросов 401 не должен вызывать session-expired redirect.
 */
describe('ApiClient 401 handling', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    delete (globalThis as { __onSessionExpired?: () => void }).__onSessionExpired;
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete (globalThis as { __onSessionExpired?: () => void }).__onSessionExpired;
  });

  it('does NOT trigger session-expired redirect for a skipAuth 401', async () => {
    const onExpired = vi.fn();
    (globalThis as { __onSessionExpired?: () => void }).__onSessionExpired = onExpired;
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(
      apiClient.get('/api/user/app-settings', { skipAuth: true })
    ).rejects.toBeInstanceOf(ApiClientError);

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('DOES trigger session-expired redirect for a normal 401', async () => {
    const onExpired = vi.fn();
    (globalThis as { __onSessionExpired?: () => void }).__onSessionExpired = onExpired;
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(apiClient.get('/api/user/progress')).rejects.toBeInstanceOf(ApiClientError);

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('returns parsed JSON on success', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    await expect(apiClient.get<{ ok: boolean }>('/api/anything')).resolves.toEqual({ ok: true });
  });
});
