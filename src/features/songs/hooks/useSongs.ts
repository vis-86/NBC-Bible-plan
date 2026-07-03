'use client';

import { useEffect, useState } from 'react';
import { songsApi } from '@/shared/services/api/endpoints';
import { readThrough } from '@/shared/offline/readThrough';
import type { SongSummary } from '../types';

const SONGS_LIST_CACHE_KEY = 'songs:list';

/**
 * Module-level кэш: список песен грузится один раз за сессию (97 песен статичны).
 * `fetchSongsOnce` — ЕДИНАЯ точка загрузки: network-first + IDB apiCache фолбэк
 * (Task 31) — офлайн отдаёт последний загруженный список.
 */
let cache: SongSummary[] | null = null;
let inflight: Promise<SongSummary[]> | null = null;

async function fetchSongsOnce(): Promise<SongSummary[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = readThrough(SONGS_LIST_CACHE_KEY, () => songsApi.getSongs())
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
