'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readSetlistThrough } from '../lib/offlineSetlists';
import { readSongThrough } from '@/features/songs/lib/offlineSongs';
import { songsApi } from '@/shared/services/api/endpoints';
import type { Setlist, SetlistItem } from '../types';

export interface SetlistPlaybackState {
  items: SetlistItem[];
  /** Название сета — заголовок шита управления. Пусто, пока сет не загружен. */
  title: string;
  /** Применить новый состав локально (правка из шита управления сетом). */
  applyItems: (next: SetlistItem[]) => void;
  /** Индекс текущей песни в сете, -1 если песня не входит в сет. */
  index: number;
  total: number;
  prevId: number | null;
  nextId: number | null;
  /** Переход к песне сета: router.replace (не push — back не должен листать историю свайпов). */
  goTo: (songId: number) => void;
  inSetlist: boolean;
}

/**
 * Навигация по сету в просмотре песни (режим сета). `setlistId` пуст ⇒ `inSetlist: false`
 * и все переходы — no-op, хук безопасно вызывается на обычном просмотре песни без сета.
 * Данные — через `readSetlistThrough` (кэш ⇒ работает офлайн). Соседей (prev/next)
 * прогреваем `readSongThrough`, чтобы свайп/кнопка были мгновенными даже без полного
 * скачивания каталога.
 */
export function useSetlistPlayback(setlistId: string | null | undefined, songId: number | string): SetlistPlaybackState {
  const router = useRouter();
  const [setlist, setSetlist] = useState<Setlist | null>(null);

  useEffect(() => {
    let active = true;
    // Резолв только внутри .then/.catch — синхронный setState в теле эффекта
    // вызывает каскадный ре-рендер (react-hooks/set-state-in-effect).
    const promise: Promise<Setlist | null> = setlistId ? readSetlistThrough(setlistId) : Promise.resolve(null);

    promise
      .then((loaded) => {
        if (active) setSetlist(loaded);
      })
      .catch((err) => {
        console.warn('[useSetlistPlayback] failed to load setlist', setlistId, err);
        if (active) setSetlist(null);
      });
    return () => {
      active = false;
    };
  }, [setlistId]);

  const numericSongId = typeof songId === 'string' ? Number(songId) : songId;
  const items = setlist?.items ?? [];
  // Списки сетов малы (десятки песен) — прямой findIndex на каждый рендер дешевле,
  // чем useMemo с зависимостью от нового массива items на каждый рендер.
  const index = items.findIndex((item) => item.songId === numericSongId);
  const inSetlist = !!setlistId && !!setlist && index !== -1;
  const total = items.length;
  const prevId = inSetlist && index > 0 ? items[index - 1].songId : null;
  const nextId = inSetlist && index < total - 1 ? items[index + 1].songId : null;

  useEffect(() => {
    if (!setlistId && numericSongId) {
      // Хук вызван без setlistId (обычный просмотр) — не предупреждаем, это ожидаемый путь.
      return;
    }
    if (setlistId && setlist && index === -1) {
      console.warn('[useSetlistPlayback] song not found in setlist', { setlistId, songId: numericSongId });
    }
  }, [setlistId, setlist, index, numericSongId]);

  useEffect(() => {
    const warm = (id: number) =>
      readSongThrough(id, () => songsApi.getSong(id).then((res) => res.song)).catch(() => {
        /* прогрев best-effort — реальный fetch случится в useSong при навигации */
      });
    if (prevId != null) void warm(prevId);
    if (nextId != null) void warm(nextId);
  }, [prevId, nextId]);

  console.debug(`[useSetlistPlayback] setlist=${setlistId ?? '-'} index=${index + 1}/${total} prev=${prevId ?? '-'} next=${nextId ?? '-'}`);

  const goTo = (targetSongId: number) => {
    if (!setlistId) return;
    router.replace(`/dashboard/song?id=${encodeURIComponent(targetSongId)}&setlistId=${encodeURIComponent(setlistId)}`);
  };

  const applyItems = (next: SetlistItem[]) =>
    setSetlist((prev) => (prev ? { ...prev, items: next } : prev));

  return { items, title: setlist?.title ?? '', applyItems, index, total, prevId, nextId, goTo, inSetlist };
}
