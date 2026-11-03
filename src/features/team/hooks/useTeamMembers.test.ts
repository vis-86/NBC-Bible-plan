// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NETWORK_TIMEOUT_MS } from '@/shared/offline/networkTimeout';
import { ApiClientError } from '@/shared/services/api/client';
import type { TeamMember } from '../types';

const api = vi.hoisted(() => ({
  listMembers: vi.fn(),
  createInvite: vi.fn(),
  createReset: vi.fn(),
  setRole: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../api', () => ({ teamApi: api }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { directus_id: 'AAAA-self' } }) }));

import { useTeamMembers } from './useTeamMembers';

const ME: TeamMember = { userId: 'aaaa-self', login: 'me', displayName: 'Я', role: 'team_admin', active: true };
const BOB: TeamMember = { userId: 'bbbb', login: 'bob', displayName: 'Боб', role: 'reader', active: true };

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('useTeamMembers', () => {
  beforeEach(() => {
    Object.values(api).forEach((m) => m.mockReset());
    api.listMembers.mockResolvedValue([ME, BOB]);
    setOnline(true);
  });
  afterEach(() => setOnline(true));

  it('загружает участников и определяет себя без учёта регистра', async () => {
    const { result } = renderHook(() => useTeamMembers());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.members).toEqual([ME, BOB]);
    expect(result.current.selfId).toBe('aaaa-self');
  });

  it('офлайн: запрос не уходит, статус offline', async () => {
    setOnline(false);
    const { result } = renderHook(() => useTeamMembers());
    await waitFor(() => expect(result.current.status).toBe('offline'));
    expect(api.listMembers).not.toHaveBeenCalled();
  });

  it('403 даёт статус forbidden', async () => {
    api.listMembers.mockRejectedValue(new ApiClientError('Forbidden', 403));
    const { result } = renderHook(() => useTeamMembers());
    await waitFor(() => expect(result.current.status).toBe('forbidden'));
  });

  it('сбой сети даёт статус error', async () => {
    api.listMembers.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTeamMembers());
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('createInvite отправляет роль и возвращает ссылку', async () => {
    api.createInvite.mockResolvedValue({ url: 'https://x/activate?t=1' });
    const { result } = renderHook(() => useTeamMembers());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let url: string | null = null;
    await act(async () => {
      url = await result.current.createInvite('musician');
    });
    expect(api.createInvite).toHaveBeenCalledWith('musician');
    expect(url).toBe('https://x/activate?t=1');
  });

  it('changeRole обновляет роль в списке; 409 показывает текст сервера', async () => {
    api.setRole.mockResolvedValueOnce({ success: true });
    const { result } = renderHook(() => useTeamMembers());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.changeRole('bbbb', 'musician');
    });
    expect(api.setRole).toHaveBeenCalledWith('bbbb', 'musician');
    expect(result.current.members.find((m) => m.userId === 'bbbb')?.role).toBe('musician');

    api.setRole.mockRejectedValueOnce(new ApiClientError('Администратора команды меняет администратор приложения', 409));
    await act(async () => {
      await result.current.changeRole('bbbb', 'reader');
    });
    expect(result.current.actionError).toBe('Администратора команды меняет администратор приложения');
    expect(result.current.members.find((m) => m.userId === 'bbbb')?.role).toBe('musician');
  });

  it('removeMember убирает участника из списка только после успеха', async () => {
    api.remove.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useTeamMembers());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.removeMember('bbbb');
    });
    expect(result.current.members).toHaveLength(2);

    api.remove.mockResolvedValueOnce({ success: true });
    await act(async () => {
      await result.current.removeMember('bbbb');
    });
    expect(result.current.members.map((m) => m.userId)).toEqual(['aaaa-self']);
  });

  describe('зависший запрос (lie-fi)', () => {
    afterEach(() => vi.useRealTimers());

    it('загрузка по таймауту даёт error, а не вечный loading', async () => {
      vi.useFakeTimers();
      api.listMembers.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useTeamMembers());
      expect(result.current.status).toBe('loading');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEFAULT_NETWORK_TIMEOUT_MS + 100);
      });
      expect(result.current.status).toBe('error');
    });

    it('действие по таймауту возвращает null и сообщение «Нет связи»', async () => {
      const { result } = renderHook(() => useTeamMembers());
      await waitFor(() => expect(result.current.status).toBe('ready'));
      vi.useFakeTimers();
      api.createInvite.mockReturnValue(new Promise(() => {}));
      let url: string | null = 'x';
      await act(async () => {
        const p = result.current.createInvite('reader');
        await vi.advanceTimersByTimeAsync(20_100);
        url = await p;
      });
      expect(url).toBeNull();
      expect(result.current.actionError).toBe('Нет связи, попробуйте ещё раз');
    });
  });
});
