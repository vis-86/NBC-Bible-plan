// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
const replayOutboxMock = vi.fn();
vi.mock('@/shared/offline/sync', () => ({ replayOutbox: () => replayOutboxMock() }));
vi.mock('@/shared/offline/autoDownload', () => ({ scheduleEnsureOfflineData: vi.fn() }));
const ensureOfflineOwnerMock = vi.fn();
vi.mock('@/shared/offline/offlineOwner', () => ({
  ensureOfflineOwner: (id: string) => ensureOfflineOwnerMock(id),
}));

import AuthProvider, { AuthContext } from './AuthProvider';
import { SETLIST_DRAFT_STORAGE_KEY } from '@/features/setlists/hooks/useSetlistDraft';
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
    replayOutboxMock.mockReset();
    localStorage.clear();
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

  it('«сессии нет» (ok:false и user:null) снимает last-known-user', async () => {
    for (const res of [
      { ok: false, json: async () => ({}) },
      { ok: true, json: async () => ({ user: null }) },
    ]) {
      await setLastKnownUser({ directus_id: 'u-old', first_name: 'Старый' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
      const { unmount } = render(
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      );
      await waitFor(async () => expect(await getLastKnownUser()).toBeUndefined());
      unmount();
    }
  });

  it('сетевой сбой НЕ снимает last-known-user', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await setLastKnownUser({ directus_id: 'u-old', first_name: 'Старый' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Старый'));
    expect(await getLastKnownUser()).toBeDefined();
    errorSpy.mockRestore();
  });

  it('после подтверждения replayOutbox вызван один раз — после владельца и last-known-user', async () => {
    let ownerDone = false;
    ensureOfflineOwnerMock.mockImplementation(async () => {
      ownerDone = true;
      return 'same';
    });
    const seen: Array<{ ownerDone: boolean; known: unknown }> = [];
    replayOutboxMock.mockImplementation(async () => {
      seen.push({ ownerDone, known: await getLastKnownUser() });
    });
    stubSession();
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(replayOutboxMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].ownerDone).toBe(true);
    expect(seen[0].known).toEqual({ directus_id: 'u-new', first_name: 'Новый' });
  });

  it('wiped -> черновик сета удалён; same -> остаётся', async () => {
    localStorage.setItem(SETLIST_DRAFT_STORAGE_KEY, '{"x":1}');
    ensureOfflineOwnerMock.mockResolvedValue('same');
    stubSession();
    const first = render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Новый'));
    expect(localStorage.getItem(SETLIST_DRAFT_STORAGE_KEY)).not.toBeNull();
    first.unmount();

    ensureOfflineOwnerMock.mockResolvedValue('wiped');
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(localStorage.getItem(SETLIST_DRAFT_STORAGE_KEY)).toBeNull());
  });
});
