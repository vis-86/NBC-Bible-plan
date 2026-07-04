'use client';

import { useEffect, useState } from 'react';
import { songsApi } from '@/shared/services/api/endpoints';
import { readSongThrough } from '../lib/offlineSongs';
import type { Song } from '../types';

/** Загрузка одной песни по id (для страницы просмотра). */
export function useSong(id: string | number | null) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id == null || id === '') {
      setSong(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setSong(null);

    // Network-first + IDB-фолбэк: офлайн отдаёт скачанную песню из store `songs`
    // (раньше здесь был голый apiClient.get → офлайн падал «Песня не найдена»).
    readSongThrough(id, () => songsApi.getSong(id).then((res) => res.song))
      .then((loaded) => {
        if (!active) return;
        setSong(loaded);
        console.debug(`[useSong] loaded song ${id}`);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить песню');
        console.error('[useSong] load error:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  return { song, loading, error };
}
