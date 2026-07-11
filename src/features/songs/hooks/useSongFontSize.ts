'use client';

import { useState, useCallback } from 'react';

export const SONG_FONT_SIZE_STORAGE_KEY = 'songs:font-size';

const DEFAULT_FONT_SIZE = 17;
const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 28;

let warnedStorageUnavailable = false;

function clamp(value: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
}

function warnStorageUnavailable(err: unknown): void {
  if (warnedStorageUnavailable) return;
  warnedStorageUnavailable = true;
  console.warn('[useSongFontSize] localStorage unavailable', err);
}

function readFontSize(): number {
  try {
    const raw = localStorage.getItem(SONG_FONT_SIZE_STORAGE_KEY);
    if (raw === null) return DEFAULT_FONT_SIZE;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_FONT_SIZE;
  } catch (err) {
    warnStorageUnavailable(err);
    return DEFAULT_FONT_SIZE;
  }
}

function writeFontSize(value: number): void {
  try {
    localStorage.setItem(SONG_FONT_SIZE_STORAGE_KEY, String(value));
  } catch (err) {
    warnStorageUnavailable(err);
  }
}

/**
 * Персист размера шрифта просмотра песни в localStorage (device-scoped, без
 * серверной синхронизации — см. `.ai-factory/PLAN.md`).
 */
export function useSongFontSize(): [number, (value: number) => void] {
  const [fontSize, setFontSizeState] = useState<number>(() => readFontSize());

  const setFontSize = useCallback((value: number) => {
    const clamped = clamp(value);
    setFontSizeState(clamped);
    writeFontSize(clamped);
  }, []);

  return [fontSize, setFontSize];
}
