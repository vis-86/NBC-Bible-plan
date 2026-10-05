'use client';

import { useEffect, useState } from 'react';
import { songsApi } from '@/shared/services/api/endpoints';
import { SONGS_LIST_CACHE_KEY, persistApiCache, readThroughSWR } from '@/shared/offline/readThrough';
import type { SongSummary } from '../types';

/**
 * Module-level кэш: список песен грузится один раз за сессию (97 песен статичны).
 * `fetchSongsOnce` — ЕДИНАЯ точка загрузки: cache-first (SWR) поверх IDB apiCache.
 * Свежий список из фоновой ревалидации применяется МОЛЧА — список не является
 * контекстом чтения на служении, подменять его безопасно (в отличие от открытой песни).
 */
let cache: SongSummary[] | null = null;
let inflight: Promise<SongSummary[]> | null = null;

/** Подписчики на молчаливое обновление списка фоновой ревалидацией. */
const listeners = new Set<(list: SongSummary[]) => void>();

function publish(list: SongSummary[]) {
  cache = list;
  listeners.forEach((notify) => notify(list));
}

async function fetchSongsOnce(): Promise<SongSummary[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = readThroughSWR(SONGS_LIST_CACHE_KEY, () => songsApi.getSongs(), {
      onFresh: (res) => {
        console.debug('[useSongs] фоновая ревалидация принесла свежий список — применяем молча');
        publish(res.songs);
      },
    })
      .then(({ data, fromCache }) => {
        console.debug('[useSongs] источник данных:', fromCache ? 'cache' : 'network');
        cache = data.songs;
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
  // Скелет показываем ТОЛЬКО когда показать нечего: при попадании в кеш его быть не должно.
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const notify = (list: SongSummary[]) => {
      if (active) setSongs(list);
    };
    listeners.add(notify);

    // Идём через единую точку всегда: при заполненном module-кэше она резолвится
    // немедленно, а setState остаётся в асинхронном колбэке (React Compiler запрещает
    // синхронный setState в теле эффекта).
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
      listeners.delete(notify);
    };
  }, []);

  return { songs, loading, error };
}

/** Сброс module-level кэша списка (после мутаций каталога/дельта-синка). */
export function resetSongsCache() {
  cache = null;
  inflight = null;
}

/**
 * Свежий список из сети — в apiCache (тот же ключ, что читает `fetchSongsOnce`) и всем
 * подписчикам. Нужен после записи песни: без него cache-first ещё до 5 минут отдавал бы
 * каталог без новой песни или со старым названием.
 */
export async function refreshSongsList(): Promise<void> {
  const res = await songsApi.getSongs();
  await persistApiCache(SONGS_LIST_CACHE_KEY, res);
  publish(res.songs);
}
