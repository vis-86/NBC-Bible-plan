'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readSetlistsThrough, refreshSetlistsFromNetwork } from '../lib/offlineSetlists';
import type { SetlistSummary } from '../types';

/** Module-level кэш: список сетов грузится один раз за сессию (по образцу `useSongs`). */
let cache: SetlistSummary[] | null = null;
let inflight: Promise<SetlistSummary[]> | null = null;

/**
 * Сбрасывает module-кэш списка — вызывать после ЛЮБОЙ мутации сета (создание, правка
 * состава, удаление). Без этого экран списка после возврата рендерит состав, которого
 * уже нет: apiCache в IDB инвалидируется, а память процесса — нет.
 */
export function resetSetlistsCache(): void {
  cache = null;
  console.debug('[useSetlists] module cache reset');
}

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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const activeRef = useRef(true);
  const refreshingRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  /**
   * Ручное обновление списка (pull-to-refresh). Всегда резолвится: вызывающий жест
   * ждёт промис, чтобы остановить спиннер, и не должен ловить исключение.
   */
  const refresh = useCallback(async () => {
    // Пул во время стартового readSetlistsThrough послал бы второй запрос за тем же.
    if (refreshingRef.current || loading) {
      console.debug('[useSetlists] refresh: skipped (already in flight)');
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    console.debug('[useSetlists] refresh: start');

    try {
      const list = await refreshSetlistsFromNetwork();
      // Обновляем module-кэш, а не сбрасываем: reset заставил бы следующий монтаж
      // экрана снова идти в сеть, хотя свежие данные уже на руках.
      cache = list;
      if (activeRef.current) {
        setSetlists(list);
        setRefreshError(null);
      }
      console.debug(`[useSetlists] refresh: ok ${list.length} setlist(s)`);
    } catch (err) {
      // Список на экране валиден — не трогаем его, показываем только сообщение.
      if (activeRef.current) {
        setRefreshError(err instanceof Error ? err.message : 'Не удалось обновить список');
      }
      console.warn('[useSetlists] refresh: failed', err);
    } finally {
      refreshingRef.current = false;
      if (activeRef.current) setRefreshing(false);
    }
  }, [loading]);

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

  return { setlists, loading, error, refresh, refreshing, refreshError };
}
