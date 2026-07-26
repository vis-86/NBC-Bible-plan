'use client';

import { useEffect, useState } from 'react';
import { readSetlistsThrough } from '../lib/offlineSetlists';
import type { SetlistSummary } from '../types';

/** Module-level кэш: список сетов грузится один раз за сессию (по образцу `useSongs`). */
let cache: SetlistSummary[] | null = null;
let inflight: Promise<SetlistSummary[]> | null = null;

async function fetchSetlistsOnce(): Promise<SetlistSummary[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = readSetlistsThrough()
      .then((list) => {
        cache = list;
        return list;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useSetlists() {
  const [setlists, setSetlists] = useState<SetlistSummary[]>(() => cache ?? []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;

    let active = true;

    fetchSetlistsOnce()
      .then((list) => {
        if (!active) return;
        setSetlists(list);
        console.debug(`[useSetlists] loaded ${list.length} setlist(s)`);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить сеты');
        console.error('[useSetlists] load error:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { setlists, loading, error };
}
