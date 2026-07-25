'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { keyByOffset, keyOptions, resolveEffectiveKey, semitonesBetween, type SongKeySource } from '../lib/songKey';
import { clearPersonalKey, readCapo, readPersonalKey, subscribePersonalKeys, writeCapo, writePersonalKey } from '../lib/personalKeyStore';
import type { Song } from '../types';

/** Максимум ладов каподастра — как в панели транспозиции (§10.4). */
const MAX_CAPO = 9;

export interface SongKeyState {
  /** ЗВУЧАЩАЯ действующая тональность (§10.1) или `undefined`, если её нет вовсе. Капо её не меняет. */
  effectiveKey?: string;
  source: SongKeySource;
  /** Сдвиг от исходной к звучащей тональности, 0..11 (без учёта капо). */
  semitones: number;
  /** Тональности для селектора — в том же ладу, что исходная. Пусто ⇒ выбирать нечего. */
  options: string[];
  setKey: (key: string) => void;
  resetKey: () => void;
  /** Каподастр в ладах, 0..9. Меняет только формы аккордов, не звучащую тональность. */
  capo: number;
  setCapo: (capo: number) => void;
  /**
   * Сдвиг для рендера листа = `semitones − capo` (нормализован в 0..11). Капо повышает
   * звук на N ладов, значит формы на листе пишутся на N полутонов НИЖЕ звучащей.
   */
  renderSemitones: number;
  /**
   * Тональность форм аккордов на листе (= звучащая, сдвинутая на −capo). При `capo = 0`
   * совпадает с `effectiveKey`. Источник спеллинга при рендере — именно она.
   */
  shapeKey?: string;
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

  // Капо — тот же внешний источник, что и тональность (один listener-набор), поэтому
  // читаем его отдельным снапшотом. Число примитивно — кэшировать снапшот не нужно.
  const capo = useSyncExternalStore(
    subscribePersonalKeys,
    () => (songId ? readCapo(songId) : 0),
    () => 0,
  );

  const resolved = useMemo(() => resolveEffectiveKey({ personalKey, defaultKey, originalKey }), [personalKey, defaultKey, originalKey]);

  const semitones = useMemo(() => {
    // Транспонировать нечего: тональности нет либо действующая совпадает с исходной.
    if (!resolved || !originalKey || resolved.key === originalKey) return 0;
    return semitonesBetween(originalKey, resolved.key);
  }, [resolved, originalKey]);

  const options = useMemo(() => keyOptions(originalKey), [originalKey]);

  // Формы на листе ниже звучащей тональности на capo полутонов; нормализуем в 0..11.
  const renderSemitones = useMemo(() => (((semitones - capo) % 12) + 12) % 12, [semitones, capo]);
  const shapeKey = useMemo(() => (capo > 0 ? keyByOffset(resolved?.key, -capo) : resolved?.key), [resolved, capo]);

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
    // Сброс к основной обязан обнулять и капо: иначе «сбросил, а аккорды другие».
    writeCapo(songId, 0);
  }, [songId]);

  const setCapo = useCallback(
    (next: number) => {
      if (!songId) return;
      writeCapo(songId, Math.max(0, Math.min(MAX_CAPO, Math.round(next))));
    },
    [songId],
  );

  return {
    effectiveKey: resolved?.key,
    source: resolved?.source ?? 'original',
    semitones,
    options,
    setKey,
    resetKey,
    capo,
    setCapo,
    renderSemitones,
    shapeKey,
  };
}
