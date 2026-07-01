'use client';

import { useMemo } from 'react';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { SongSummary } from '../types';

/**
 * Клиентский нечёткий поиск по каталогу (97 песен). Fuse.js терпим к опечаткам/
 * раскладке; индекс по title+subtitle. Та же библиотека, что в источнике chordpro-app.
 */
const FUSE_OPTIONS: IFuseOptions<SongSummary> = {
  keys: ['title', 'subtitle'],
  threshold: 0.4,
  ignoreLocation: true,
};

/** Чистая функция поиска (для тестов и хука). Пустой запрос → весь список. */
export function searchSongs(songs: SongSummary[], query: string): SongSummary[] {
  const q = query.trim();
  if (!q) return songs;
  return new Fuse(songs, FUSE_OPTIONS).search(q).map((r) => r.item);
}

/** Хук: мемоизирует индекс по songs, пересчитывает результат по query. */
export function useSongSearch(songs: SongSummary[], query: string): SongSummary[] {
  const fuse = useMemo(() => new Fuse(songs, FUSE_OPTIONS), [songs]);

  return useMemo(() => {
    const q = query.trim();
    if (!q) return songs;
    const results = fuse.search(q).map((r) => r.item);
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[useSongSearch] query="${q}" → ${results.length}/${songs.length}`);
    }
    return results;
  }, [fuse, query, songs]);
}
