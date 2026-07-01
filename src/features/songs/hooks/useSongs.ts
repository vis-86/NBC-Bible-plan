'use client';

import { useEffect, useState } from 'react';
import { songsApi } from '@/shared/services/api/endpoints';
import type { SongSummary } from '../types';

/**
 * Module-level кэш: список песен грузится один раз за сессию (97 песен статичны).
 * `fetchSongsOnce` — ЕДИНАЯ точка загрузки: сюда позже встанет offline cache-слой
 * (SW cache-first) без переписывания хука/страниц (см. план, future).
 */
let cache: SongSummary[] | null = null;
let inflight: Promise<SongSummary[]> | null = null;

async function fetchSongsOnce(): Promise<SongSummary[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = songsApi
      .getSongs()
      .then((res) => {
        cache = res.songs;
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useSongs() {
  const [songs, setSongs] = useState<SongSummary[]>(() => cache ?? []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) {
      setSongs(cache);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchSongsOnce()
      .then((list) => {
        if (!active) return;
        setSongs(list);
        console.debug(`[useSongs] loaded ${list.length} song(s)`);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить песни');
        console.error('[useSongs] load error:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { songs, loading, error };
}
