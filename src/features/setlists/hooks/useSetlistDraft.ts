'use client';

import { useCallback, useEffect, useState } from 'react';

/** Черновик билдера сета в sessionStorage — переживает переход в песню и обратно. */
export const SETLIST_DRAFT_STORAGE_KEY = 'setlists:draft';

export interface SetlistDraft {
  /** Порядок = порядок добавления (список песен в builder читается тапом, не drag). */
  songIds: number[];
  title: string;
  date: string | null;
  /**
   * `null` — черновик создания. Иначе — id редактируемого сета: страница редактирования
   * сверяет это поле с своим `?id=`, чтобы решить, предзаполнять ли черновик заново
   * из детали сета (открыт другой сет / впервые) или продолжить незавершённую правку.
   */
  editingId: string | null;
}

const EMPTY_DRAFT: SetlistDraft = { songIds: [], title: '', date: null, editingId: null };

function sanitize(raw: unknown): SetlistDraft {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_DRAFT };
  const obj = raw as Partial<SetlistDraft>;
  const songIds = Array.isArray(obj.songIds) ? obj.songIds.filter((n): n is number => typeof n === 'number') : [];
  const title = typeof obj.title === 'string' ? obj.title : '';
  const date = typeof obj.date === 'string' ? obj.date : null;
  const editingId = typeof obj.editingId === 'string' ? obj.editingId : null;
  return { songIds, title, date, editingId };
}

function readDraft(): SetlistDraft {
  try {
    const raw = sessionStorage.getItem(SETLIST_DRAFT_STORAGE_KEY);
    if (raw === null) return { ...EMPTY_DRAFT };
    return sanitize(JSON.parse(raw));
  } catch (err) {
    // Битый JSON в sessionStorage не должен ронять экран (паттерн useSongViewSettings).
    console.warn('[useSetlistDraft] sessionStorage недоступен/повреждён, сброс черновика', err);
    return { ...EMPTY_DRAFT };
  }
}

function writeDraft(draft: SetlistDraft): void {
  try {
    sessionStorage.setItem(SETLIST_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (err) {
    console.warn('[useSetlistDraft] запись в sessionStorage не удалась', err);
  }
}

export function clearSetlistDraft(): void {
  try {
    sessionStorage.removeItem(SETLIST_DRAFT_STORAGE_KEY);
  } catch {
    /* не критично */
  }
}

export function useSetlistDraft() {
  const [draft, setDraftState] = useState<SetlistDraft>(() => readDraft());

  useEffect(() => {
    writeDraft(draft);
  }, [draft]);

  const toggleSong = useCallback((songId: number) => {
    setDraftState((prev) => {
      const has = prev.songIds.includes(songId);
      const songIds = has ? prev.songIds.filter((id) => id !== songId) : [...prev.songIds, songId];
      console.debug(`[SetlistBuilder] toggled ${songId}, selected=${songIds.length}`);
      return { ...prev, songIds };
    });
  }, []);

  const removeSong = useCallback((songId: number) => {
    setDraftState((prev) => ({ ...prev, songIds: prev.songIds.filter((id) => id !== songId) }));
  }, []);

  /** Меняет местами позиции `index` и `index + delta` (delta = ±1, кнопки «Вверх/Вниз»). */
  const moveSong = useCallback((index: number, delta: 1 | -1) => {
    setDraftState((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.songIds.length) return prev;
      const songIds = [...prev.songIds];
      [songIds[index], songIds[to]] = [songIds[to], songIds[index]];
      console.debug(`[SetlistBuilder] reorder ${index} → ${to}`);
      return { ...prev, songIds };
    });
  }, []);

  const setTitle = useCallback((title: string) => setDraftState((prev) => ({ ...prev, title })), []);
  const setDate = useCallback((date: string | null) => setDraftState((prev) => ({ ...prev, date })), []);
  const setSongIds = useCallback((songIds: number[]) => setDraftState((prev) => ({ ...prev, songIds })), []);
  const load = useCallback((next: Partial<SetlistDraft>) => setDraftState((prev) => ({ ...prev, ...next })), []);
  const clear = useCallback(() => {
    setDraftState({ ...EMPTY_DRAFT });
    clearSetlistDraft();
  }, []);

  return { draft, toggleSong, removeSong, moveSong, setTitle, setDate, setSongIds, load, clear };
}
