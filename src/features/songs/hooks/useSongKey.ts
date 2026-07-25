'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { keyOptions, resolveEffectiveKey, semitonesBetween, type SongKeySource } from '../lib/songKey';
import { clearPersonalKey, readPersonalKey, subscribePersonalKeys, writePersonalKey } from '../lib/personalKeyStore';
import type { Song } from '../types';

export interface SongKeyState {
  /** Действующая тональность (§10.1) или `undefined`, если у песни её нет вовсе. */
  effectiveKey?: string;
  source: SongKeySource;
  /** Сдвиг от исходной тональности к действующей, 0..11. */
  semitones: number;
  /** Тональности для селектора — в том же ладу, что исходная. Пусто ⇒ выбирать нечего. */
  options: string[];
  setKey: (key: string) => void;
  resetKey: () => void;
}

/**
 * Связывает резолвер тональности (§10.1) с персистом личного выбора.
 *
 * `setlistKey` не передаётся: сетлистов ещё нет (M7), резолвер эту ветку поддерживает,
 * но источника для неё в UI пока нет.
 */
export function useSongKey(song: Song | null | undefined): SongKeyState {
  const songId = song?.id;
  const originalKey = song?.key;
  const defaultKey = song?.defaultKey;

  // Личная тональность живёт в localStorage — читаем её как внешний источник:
  // маршрут детали один (`?id=`), между песнями компонент не размонтируется, поэтому
  // смена `songId` обязана давать новое значение без эффектов и без setState.
  const personalKey = useSyncExternalStore(
    subscribePersonalKeys,
    () => (songId ? readPersonalKey(songId) : undefined),
    // Пререндер статического экспорта localStorage не видит — там личной тональности нет.
    () => undefined,
  );

  const resolved = useMemo(() => resolveEffectiveKey({ personalKey, defaultKey, originalKey }), [personalKey, defaultKey, originalKey]);

  const semitones = useMemo(() => {
    // Транспонировать нечего: тональности нет либо действующая совпадает с исходной.
    if (!resolved || !originalKey || resolved.key === originalKey) return 0;
    return semitonesBetween(originalKey, resolved.key);
  }, [resolved, originalKey]);

  const options = useMemo(() => keyOptions(originalKey), [originalKey]);

  const setKey = useCallback(
    (key: string) => {
      if (!songId) return;
      writePersonalKey(songId, key);
    },
    [songId],
  );

  const resetKey = useCallback(() => {
    if (!songId) return;
    clearPersonalKey(songId);
  }, [songId]);

  return {
    effectiveKey: resolved?.key,
    source: resolved?.source ?? 'original',
    semitones,
    options,
    setKey,
    resetKey,
  };
}
