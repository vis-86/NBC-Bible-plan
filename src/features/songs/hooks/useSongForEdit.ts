'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '@/shared/services/api/client';
import { songsApi } from '@/shared/services/api/endpoints';
import { isDefinitelyOffline } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, raceWithTimeout } from '@/shared/offline/networkTimeout';
import type { Song } from '../types';

export type SongForEditState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; song: Song }
  | { status: 'offline' }
  | { status: 'error'; message: string };

/**
 * Песня для редактора — ТОЛЬКО из сети, мимо read-through. Осознанное исключение из
 * cache-first: редактор отправляет текст целиком, и правка поверх закешированной версии
 * молча откатила бы чужую свежую правку. Запись всё равно online-only, так что офлайн
 * здесь честное «нужен интернет», а не деградация.
 *
 * `id === null` — создание новой песни, грузить нечего.
 */
export function useSongForEdit(id: string | null) {
  const [state, setState] = useState<SongForEditState>(() => (id ? { status: 'loading' } : { status: 'idle' }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let active = true;

    const load = async (): Promise<SongForEditState> => {
      if (isDefinitelyOffline()) return { status: 'offline' };
      try {
        const { song } = await raceWithTimeout(songsApi.getSong(id), DEFAULT_NETWORK_TIMEOUT_MS);
        return { status: 'ready', song };
      } catch (err) {
        console.error(`[useSongForEdit] load ${id} failed`, err);
        if (err instanceof ApiClientError && err.status === 404) {
          return { status: 'error', message: 'Песня не найдена — возможно, её удалили.' };
        }
        return { status: 'error', message: 'Не удалось загрузить песню. Проверьте интернет и попробуйте ещё раз.' };
      }
    };

    // setState только в асинхронном колбэке (react-hooks/set-state-in-effect).
    void Promise.resolve()
      .then(() => {
        if (active) setState({ status: 'loading' });
        return load();
      })
      .then((next) => {
        if (active) setState(next);
      });

    return () => {
      active = false;
    };
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
