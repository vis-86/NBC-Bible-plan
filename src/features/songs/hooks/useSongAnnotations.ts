'use client';

/**
 * Пометки текущей песни для экрана: чтение через read-through, запись через outbox.
 * Хук намеренно тонкий — вся политика живёт в `songAnnotationsStore`.
 */
import { useCallback, useEffect, useState } from 'react';
import { EMPTY_SONG_ANNOTATIONS, readAnnotations, writeAnnotations } from '../lib/songAnnotationsStore';
import type { SongStroke } from '../types';

export interface UseSongAnnotationsResult {
  strokes: SongStroke[];
  save: (strokes: SongStroke[]) => void;
}

export function useSongAnnotations(songId: string): UseSongAnnotationsResult {
  // Флага загрузки нет намеренно: пометки — вторичные данные, лист рендерится сразу
  // и дорисовывает их, когда они приедут. Спиннер здесь только мигал бы поверх песни.
  const [strokes, setStrokes] = useState<SongStroke[]>(EMPTY_SONG_ANNOTATIONS.strokes);

  useEffect(() => {
    // Пустой id — песни на экране нет; сбрасывать нечего.
    if (!songId) return;
    let cancelled = false;
    // Пометки — вторичные данные: их сбой не должен ронять лист, поэтому read-through
    // сам возвращает пустой набор вместо ошибки, а здесь остаётся только защита от гонки.
    readAnnotations(songId)
      .then((annotations) => {
        if (cancelled) return;
        setStrokes(annotations.strokes);
      });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  const save = useCallback(
    (next: SongStroke[]) => {
      setStrokes(next);
      if (!songId) return;
      void writeAnnotations(songId, next).catch((err) => {
        // Очередь сама переживает офлайн; сюда доходят только сбои самой IDB.
        console.warn('[useSongAnnotations] save failed', err);
      });
    },
    [songId]
  );

  return { strokes, save };
}
