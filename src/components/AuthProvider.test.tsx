// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

import AuthProvider, { AuthContext } from './AuthProvider';
import { setLastKnownUser, getLastKnownUser } from '@/shared/offline/lastKnownUser';
import { __resetDBConnection } from '@/shared/offline/db';

function Consumer() {
  const ctx = useContext(AuthContext);
  if (!ctx) return null;
  return (
    <div>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <span data-testid="user">{ctx.user ? ctx.user.first_name : 'none'}</span>
      <button onClick={() => ctx.logout()}>logout</button>
    </div>
  );
}

describe('AuthProvider offline last-known-user fallback', () => {
  beforeEach(() => {
    __resetDBConnection();
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('ЗАВИСШИЙ session-fetch (реальный «офлайн» без reject) -> по таймауту подставляет last-known-user', async () => {
    // Регрессионный тест: в мёртвой соте fetch висит минутами, а не падает — без
    // таймаута authLoading не снимался и пользователь навсегда видел FullScreenLoader.
    await setLastKnownUser({ directus_id: 'u1', first_name: 'Игорь' });
    vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {}))); // висит вечно
    // Фейкаем только setTimeout — fake-indexeddb внутри живёт на других примитивах.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await vi.advanceTimersByTimeAsync(6001);
    vi.useRealTimers();

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('Игорь');
  });

  it('при сетевой ошибке (fetch throw) подставляет last-known-user из IDB', async () => {
    await setLastKnownUser({ directus_id: 'u1', first_name: 'Игорь' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('Игорь');
  });

  it('при response.ok === false (реальный logout) НЕ подставляет last-known-user', async () => {
    await setLastKnownUser({ directus_id: 'u1', first_name: 'Игорь' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('logout() чистит last-known-user из IDB', async () => {
    await setLastKnownUser({ directus_id: 'u1', first_name: 'Игорь' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/api/auth/logout')) {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ user: { directus_id: 'u1', first_name: 'Игорь' } }) });
      })
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Игорь'));

    screen.getByRole('button', { name: 'logout' }).click();

    await waitFor(async () => {
      expect(await getLastKnownUser()).toBeUndefined();
    });
  });
});
