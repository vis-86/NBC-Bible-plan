'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '@/shared/services/api/client';
import { songsApi } from '@/shared/services/api/endpoints';
import { isDefinitelyOffline } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, raceWithTimeout } from '@/shared/offline/networkTimeout';
import type { Song } from '../types';

export type PublicSongState =
  | { status: 'loading' }
  | { status: 'ready'; song: Song }
  /** Песни нет либо она только для своих — сервер их намеренно не различает. */
  | { status: 'unavailable' }
  | { status: 'offline' }
  | { status: 'error' };

/**
 * Песня для гостя по ссылке «Поделиться» — только из сети. Осознанное исключение из
 * offline-first: у гостя нет ни сессии, ни IDB с песнями; у вошедшего страница уводит
 * на `/dashboard/song`, где чтение офлайн. `id === ''` — грузить нечего.
 */
export function usePublicSong(id: string) {
  const [state, setState] = useState<PublicSongState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let active = true;

    const load = async (): Promise<PublicSongState> => {
      if (isDefinitelyOffline()) return { status: 'offline' };
      try {
        const { song } = await raceWithTimeout(songsApi.getPublicSong(id), DEFAULT_NETWORK_TIMEOUT_MS);
        return { status: 'ready', song };
      } catch (err) {
        if (err instanceof ApiClientError && (err.status === 404 || err.status === 400)) {
          return { status: 'unavailable' };
        }
        console.error(`[usePublicSong] load ${id} failed`, err);
        return { status: 'error' };
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
