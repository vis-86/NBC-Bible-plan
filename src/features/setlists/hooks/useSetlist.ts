'use client';

import { useEffect, useState } from 'react';
import { readSetlistThrough } from '../lib/offlineSetlists';
import type { Setlist } from '../types';

/** Загрузка одного сета по id (для страницы просмотра/редактирования). */
export function useSetlist(id: string | null) {
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [loading, setLoading] = useState(() => id != null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // Резолв только внутри .then — синхронный setState в теле эффекта
    // вызывает каскадный ре-рендер (react-hooks/set-state-in-effect).
    const promise: Promise<Setlist | null> = id == null ? Promise.resolve(null) : readSetlistThrough(id);

    promise
      .then((loaded) => {
        if (!active) return;
        setSetlist(loaded);
        setError(null);
        if (loaded) console.debug(`[useSetlist] loaded ${id}`);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить сет');
        console.error('[useSetlist] load error:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  return { setlist, loading, error };
}
