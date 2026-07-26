// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { __resetDBConnection } from '@/shared/offline/db';

const { getRoleMock, authState } = vi.hoisted(() => ({
  getRoleMock: vi.fn(),
  authState: { user: { directus_id: 'u1' } as { directus_id: string } | null },
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  userApi: { getRole: getRoleMock },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authState.user, loading: false, logout: vi.fn() }),
}));

import { persistApiCache } from '@/shared/offline/readThrough';
import { appRoleCacheKey, useAppRole } from './useAppRole';

describe('useAppRole', () => {
  beforeEach(() => {
    __resetDBConnection();
    getRoleMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('сеть ок — роль приходит из ответа', async () => {
    authState.user = { directus_id: 'net-user' };
    getRoleMock.mockResolvedValueOnce({ role: 'musician' });

    const { result } = renderHook(() => useAppRole());

    await waitFor(() => expect(result.current.role).toBe('musician'));
    expect(result.current.canManageSetlists).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('сеть падает + есть кэш → роль из кэша', async () => {
    authState.user = { directus_id: 'cached-user' };
    await persistApiCache(appRoleCacheKey('cached-user'), { role: 'musician' });
    getRoleMock.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useAppRole());

    await waitFor(() => expect(result.current.role).toBe('musician'));
  });

  it('сеть падает + кэша нет → fail-closed reader', async () => {
    authState.user = { directus_id: 'no-cache-user' };
    getRoleMock.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useAppRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe('reader');
  });

  it('смена directus_id сбрасывает кэш', async () => {
    authState.user = { directus_id: 'user-a' };
    getRoleMock.mockResolvedValueOnce({ role: 'musician' });

    const { result, rerender } = renderHook(() => useAppRole());
    await waitFor(() => expect(result.current.role).toBe('musician'));

    authState.user = { directus_id: 'user-b' };
    getRoleMock.mockResolvedValueOnce({ role: 'reader' });
    rerender();

    await waitFor(() => expect(result.current.role).toBe('reader'));
    expect(getRoleMock).toHaveBeenCalledTimes(2);
  });
});
