'use client';

import { useEffect, useState } from 'react';
import { readSetlistThroughSWR } from '../lib/offlineSetlists';
import { warmSetlistSongs } from '../lib/warmSetlistSongs';
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
    // Чтение cache-first: кеш отдаётся сразу, свежая деталь применяется молча —
    // экран read-only, подменять здесь нечего (в отличие от открытого листа песни).
    const promise: Promise<Setlist | null> =
      id == null
        ? Promise.resolve(null)
        : readSetlistThroughSWR(id, {
            onFresh: (fresh) => {
              if (!active) return;
              console.debug(`[useSetlist] ${id}: применяем свежую версию молча`);
              setSetlist(fresh);
            },
          }).then(({ setlist: loaded }) => loaded);

    promise
      .then((loaded) => {
        if (!active) return;
        setSetlist(loaded);
        setError(null);
        if (loaded) {
          console.debug(`[useSetlist] loaded ${id}`);
          // Прогрев всех песен сета: открыв сет, человек почти наверняка пойдёт по нему
          // подряд — к моменту тапа песня уже в IDB. Не блокирует рендер и молчит при сбое.
          void warmSetlistSongs(loaded.id, loaded.items);
        }
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
