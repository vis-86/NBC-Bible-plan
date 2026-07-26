'use client';

import { useCallback, useEffect, useState } from 'react';

/** Черновик билдера сета в sessionStorage — переживает переход в песню и обратно. */
export const SETLIST_DRAFT_STORAGE_KEY = 'setlists:draft';

/** Шаг билдера: выбор песен → подтверждение (название, дата, порядок). */
export type SetlistDraftStep = 'pick' | 'confirm';

export interface SetlistDraft {
  /** Порядок = порядок добавления по умолчанию; далее меняется drag-reorder на шаге `confirm`. */
  songIds: number[];
  title: string;
  date: string | null;
  /**
   * Текущий шаг билдера. Лежит в черновике, а не в `useState`: черновик переживает
   * уход в песню и обратно, и шаг обязан вернуться тот же, иначе пользователь после
   * возврата теряет заполненные название/дату из виду.
   */
  step: SetlistDraftStep;
}

const EMPTY_DRAFT: SetlistDraft = { songIds: [], title: '', date: null, step: 'pick' };

function sanitize(raw: unknown): SetlistDraft {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_DRAFT };
  const obj = raw as Partial<SetlistDraft>;
  const songIds = Array.isArray(obj.songIds) ? obj.songIds.filter((n): n is number => typeof n === 'number') : [];
  const title = typeof obj.title === 'string' ? obj.title : '';
  const date = typeof obj.date === 'string' ? obj.date : null;
  // Шаг `confirm` без единой песни — тупик (нечего подтверждать), откатываем на выбор.
  const step: SetlistDraftStep = obj.step === 'confirm' && songIds.length > 0 ? 'confirm' : 'pick';
  return { songIds, title, date, step };
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

  const setTitle = useCallback((title: string) => setDraftState((prev) => ({ ...prev, title })), []);
  const setDate = useCallback((date: string | null) => setDraftState((prev) => ({ ...prev, date })), []);
  const setSongIds = useCallback((songIds: number[]) => setDraftState((prev) => ({ ...prev, songIds })), []);

  /**
   * Шаг `confirm` требует хотя бы одну песню — иначе экран подтверждения пустой.
   * Возвращаем `pick` вместо молчаливого перехода в тупик.
   */
  const setStep = useCallback((step: SetlistDraftStep) => {
    setDraftState((prev) => {
      if (step === 'confirm' && prev.songIds.length === 0) {
        console.warn('[SetlistBuilder] переход на confirm без выбранных песен отклонён');
        return prev;
      }
      console.debug(`[SetlistBuilder] step -> ${step}`);
      return { ...prev, step };
    });
  }, []);

  /**
   * Полный новый порядок из drag-reorder (Framer Motion `Reorder`). Принимается
   * ТОЛЬКО перестановка текущего состава: список в билдере отфильтрован по загруженному
   * каталогу песен, поэтому нерезолвившийся id иначе молча исчез бы из черновика и уехал
   * бы в PATCH усечённым составом.
   */
  const reorderSongs = useCallback((songIds: number[]) => {
    setDraftState((prev) => {
      const isPermutation =
        songIds.length === prev.songIds.length && songIds.every((id) => prev.songIds.includes(id));
      if (!isPermutation) {
        console.warn('[SetlistBuilder] drag reorder отклонён: состав не совпадает с черновиком', {
          draft: prev.songIds,
          incoming: songIds,
        });
        return prev;
      }
      console.debug('[SetlistBuilder] drag reorder ->', songIds);
      return { ...prev, songIds };
    });
  }, []);

  const load = useCallback((next: Partial<SetlistDraft>) => setDraftState((prev) => ({ ...prev, ...next })), []);
  const clear = useCallback(() => {
    setDraftState({ ...EMPTY_DRAFT });
    clearSetlistDraft();
  }, []);

  return { draft, toggleSong, removeSong, reorderSongs, setStep, setTitle, setDate, setSongIds, load, clear };
}
