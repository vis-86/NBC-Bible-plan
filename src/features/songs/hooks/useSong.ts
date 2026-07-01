'use client';

import { useEffect, useState } from 'react';
import { songsApi } from '@/shared/services/api/endpoints';
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

    songsApi
      .getSong(id)
      .then((res) => {
        if (!active) return;
        setSong(res.song);
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
