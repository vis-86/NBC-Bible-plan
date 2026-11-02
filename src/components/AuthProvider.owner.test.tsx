// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/shared/offline/autoDownload', () => ({ scheduleEnsureOfflineData: vi.fn() }));
const ensureOfflineOwnerMock = vi.fn();
vi.mock('@/shared/offline/offlineOwner', () => ({
  ensureOfflineOwner: (id: string) => ensureOfflineOwnerMock(id),
}));

import AuthProvider, { AuthContext } from './AuthProvider';
import { getLastKnownUser, setLastKnownUser } from '@/shared/offline/lastKnownUser';
import { __resetDBConnection } from '@/shared/offline/db';
import { resetNetworkSuspicionForTests } from '@/shared/offline/networkHealth';

function Consumer() {
  const ctx = useContext(AuthContext);
  if (!ctx) return null;
  return (
    <div>
      <span data-testid="user">{ctx.user ? ctx.user.first_name : 'none'}</span>
      <button onClick={() => ctx.logout()}>logout</button>
    </div>
  );
}

function stubSession() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { directus_id: 'u-new', first_name: 'Новый' } }),
    })
  );
}

describe('AuthProvider offline owner', () => {
  beforeEach(() => {
    __resetDBConnection();
    resetNetworkSuspicionForTests();
    ensureOfflineOwnerMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ensureOfflineOwner отрабатывает до того, как контекст отдаёт пользователя', async () => {
    let release: () => void = () => {};
    ensureOfflineOwnerMock.mockImplementation(() => new Promise<string>((r) => (release = () => r('wiped'))));
    stubSession();

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(ensureOfflineOwnerMock).toHaveBeenCalledWith('u-new'));
    expect(screen.getByTestId('user').textContent).toBe('none');

    release();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Новый'));
  });

  it('logout во время ожидания ensureOfflineOwner: пользователь не возвращается', async () => {
    let release: () => void = () => {};
    ensureOfflineOwnerMock.mockImplementation(() => new Promise<string>((r) => (release = () => r('same'))));
    await setLastKnownUser({ directus_id: 'u-new', first_name: 'Новый' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          String(url).includes('/api/auth/logout')
            ? { ok: true, json: async () => ({}) }
            : { ok: true, json: async () => ({ user: { directus_id: 'u-new', first_name: 'Новый' } }) }
        )
      )
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(ensureOfflineOwnerMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    await waitFor(async () => expect(await getLastKnownUser()).toBeUndefined());

    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(await getLastKnownUser()).toBeUndefined();
  });

  it('пустой directus_id: ensureOfflineOwner не вызывается, вход продолжается', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { first_name: 'Новый' } }) })
    );
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Новый'));
    expect(ensureOfflineOwnerMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('сбой ensureOfflineOwner не блокирует вход', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    ensureOfflineOwnerMock.mockRejectedValue(new Error('idb down'));
    stubSession();

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Новый'));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
