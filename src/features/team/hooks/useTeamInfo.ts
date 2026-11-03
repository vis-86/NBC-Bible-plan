'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { readThroughSWR } from '@/shared/offline/readThrough';
import { teamApi } from '../api';
import type { TeamInfo } from '../types';

/** Ключ apiCache — per-user: на одном устройстве название чужой команды не должно подставляться. */
export function teamInfoCacheKey(userId: string): string {
  return `team:info:${userId}`;
}

/** Название команды: cache-first; офлайн без кеша — `null` (секция без названия). */
export function useTeamInfo(): TeamInfo | null {
  const { user } = useAuth();
  const userId = user?.directus_id ?? null;
  const [team, setTeam] = useState<TeamInfo | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    readThroughSWR(teamInfoCacheKey(userId), () => teamApi.getTeam(), {
      onFresh: (fresh) => {
        if (active) setTeam(fresh);
      },
    })
      .then(({ data }) => {
        if (active) setTeam(data);
      })
      .catch((err) => {
        console.debug('[useTeamInfo] team info unavailable', err);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return team;
}
