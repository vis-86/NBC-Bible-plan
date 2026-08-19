'use client';

import { useEffect, useState } from 'react';
import { canManageSetlists, type AppRole } from '@/lib/app-roles';
import { useAuth } from '@/hooks/useAuth';
import { readThroughSWR } from '@/shared/offline/readThrough';
import { userApi } from '@/shared/services/api/endpoints';

/**
 * Ключ apiCache для роли — per-user, иначе на одном устройстве офлайн-фолбэк
 * мог бы отдать роль предыдущего залогиненного пользователя.
 */
export function appRoleCacheKey(userId: string): string {
  return `user:role:${userId}`;
}

/**
 * Module-level кэш роли на сессию страницы (как `useSongs`). До первой загрузки
 * и при сбое сети без кеша — fail-closed на `'reader'`, чтобы кнопки записи не
 * появлялись авансом. Сбрасывается при смене пользователя (logout/login).
 */
let cachedRole: AppRole | null = null;
let cachedForUserId: string | null = null;
let inflight: Promise<AppRole> | null = null;

function resetCacheIfUserChanged(userId: string): void {
  if (cachedForUserId !== userId) {
    cachedRole = null;
    cachedForUserId = userId;
  }
}

async function fetchRoleOnce(userId: string): Promise<AppRole> {
  resetCacheIfUserChanged(userId);
  if (cachedRole) return cachedRole;
  if (!inflight) {
    // Cache-first: роль меняется редко, а её чтение стоит на пути отрисовки кнопок.
    // Свежая роль применяется молча в module-кэш; экран подхватит её при следующем
    // монтировании — визуально дёргать кнопки под руками не нужно.
    inflight = readThroughSWR(appRoleCacheKey(userId), () => userApi.getRole(), {
      onFresh: (fresh) => {
        if (cachedForUserId !== userId) return;
        cachedRole = fresh.role;
        console.debug(`[useAppRole] фоновая ревалидация: role=${cachedRole}`);
      },
    })
      .then(({ data: res, fromCache }) => {
        cachedRole = res.role;
        console.debug(`[useAppRole] role=${cachedRole} (source=${fromCache ? 'cache' : 'network'})`);
        return cachedRole;
      })
      .catch((err) => {
        console.debug('[useAppRole] role fetch failed, falling back to reader', err);
        return 'reader' as AppRole;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function initialRole(userId: string | null): AppRole {
  if (userId && cachedForUserId === userId && cachedRole) return cachedRole;
  return 'reader';
}

function initialLoading(userId: string | null): boolean {
  if (!userId) return false;
  return !(cachedForUserId === userId && cachedRole);
}

export function useAppRole(): { role: AppRole; canManageSetlists: boolean; loading: boolean } {
  const { user } = useAuth();
  const userId = user?.directus_id ?? null;
  const [role, setRole] = useState<AppRole>(() => initialRole(userId));
  const [loading, setLoading] = useState<boolean>(() => initialLoading(userId));

  useEffect(() => {
    let active = true;
    // Роль резолвится только внутри .then — синхронный setState в теле эффекта
    // вызывает каскадный ре-рендер (react-hooks/set-state-in-effect).
    const rolePromise: Promise<AppRole> = userId ? fetchRoleOnce(userId) : Promise.resolve<AppRole>('reader');

    rolePromise.then((resolved) => {
      if (!active) return;
      setRole(resolved);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  return { role, canManageSetlists: canManageSetlists(role), loading };
}
