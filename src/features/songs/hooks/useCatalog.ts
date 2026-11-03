'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '@/shared/services/api/client';
import { catalogApi } from '@/shared/services/api/endpoints';
import { isDefinitelyOffline } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, raceWithTimeout } from '@/shared/offline/networkTimeout';
import type { CatalogSong } from '../types';

export type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; songs: CatalogSong[] }
  | { status: 'offline' }
  | { status: 'forbidden' }
  | { status: 'error' };

/**
 * Общий каталог песен — только из сети (осознанное исключение из offline-first):
 * данные не кладутся ни в IDB, ни в apiCache. Заведомый офлайн — без запроса.
 */
export function useCatalog() {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<CatalogState> => {
      if (isDefinitelyOffline()) return { status: 'offline' };
      try {
        const { songs } = await raceWithTimeout(catalogApi.list(), DEFAULT_NETWORK_TIMEOUT_MS);
        return { status: 'ready', songs };
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 403) return { status: 'forbidden' };
        console.error('[useCatalog] load failed', err);
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
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
