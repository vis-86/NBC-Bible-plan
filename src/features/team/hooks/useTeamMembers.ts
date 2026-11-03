'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AppRole } from '@/lib/app-roles';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/shared/hooks/useIsOnline';
import { ApiClientError } from '@/shared/services/api/client';
import { teamApi } from '../api';
import type { TeamMember } from '../types';

export type TeamMembersStatus = 'loading' | 'ready' | 'offline' | 'forbidden' | 'error';

/** Сообщение об ошибке действия; 409 (себя) и 404 (уже убран) объясняем отдельно. */
function actionError(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.status === 403) return 'Нет доступа';
    if (err.status === 404) return 'Участник не найден — обновите список';
    if (err.status === 409) return 'Нельзя применить это действие к самому себе';
  }
  return 'Не удалось выполнить действие. Попробуйте ещё раз';
}

/**
 * Участники команды для администратора. Online-only: без сети запрос не уходит,
 * данные не кешируются (IDB не используется).
 */
export function useTeamMembers() {
  const { user } = useAuth();
  const isOnline = useIsOnline();
  const [status, setStatus] = useState<TeamMembersStatus>('loading');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const selfId = user?.directus_id?.toLowerCase() ?? null;

  const load = useCallback(async () => {
    // `useIsOnline` стартует с true и поправляется только в эффекте — флаг читаем и напрямую.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return;
    }
    setStatus('loading');
    try {
      setMembers(await teamApi.listMembers());
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) setStatus('forbidden');
      else setStatus('error');
    }
  }, []);

  useEffect(() => {
    const run = () => void load();
    run();
  }, [load]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setActionErr(null);
      try {
        return await fn();
      } catch (err) {
        setActionErr(actionError(err));
        return null;
      }
    },
    []
  );

  const createInvite = useCallback((role: AppRole) => run(async () => (await teamApi.createInvite(role)).url), [run]);
  const createReset = useCallback((userId: string) => run(async () => (await teamApi.createReset(userId)).url), [run]);

  const changeRole = useCallback(
    async (userId: string, role: AppRole) => {
      const ok = await run(() => teamApi.setRole(userId, role));
      if (ok) setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
      return ok !== null;
    },
    [run]
  );

  const removeMember = useCallback(
    async (userId: string) => {
      const ok = await run(() => teamApi.remove(userId));
      if (ok) setMembers((prev) => prev.filter((m) => m.userId !== userId));
      return ok !== null;
    },
    [run]
  );

  return {
    status: !isOnline && status !== 'forbidden' ? ('offline' as const) : status,
    members,
    selfId,
    actionError: actionErr,
    reload: load,
    createInvite,
    createReset,
    changeRole,
    removeMember,
  };
}
