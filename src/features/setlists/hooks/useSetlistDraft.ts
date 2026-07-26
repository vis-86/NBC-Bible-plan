'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Черновик билдера сета. Хранится в localStorage, а не в sessionStorage: переживает
 * не только уход в песню и обратно, но и закрытие вкладки/перезапуск PWA — набор сета
 * прерывается реальной жизнью, а запись сетов online-only, так что потерять его нечем
 * компенсировать. Плата за долгую жизнь — TTL и явная плашка восстановления (см. ниже).
 */
export const SETLIST_DRAFT_STORAGE_KEY = 'setlists:draft';

/**
 * Срок годности черновика. Без него пользователь через месяц открывает «создать сет»
 * и получает полузабытый чужой по смыслу список, не понимая, откуда он взялся.
 */
export const SETLIST_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

/** Запись в localStorage = черновик + отметка времени (для TTL и плашки восстановления). */
interface StoredDraft extends SetlistDraft {
  savedAt: number;
}

const EMPTY_DRAFT: SetlistDraft = { songIds: [], title: '', date: null, step: 'pick' };

/**
 * Пустой = нет ни одной песни. Название и дата сами по себе не считаются: в широком
 * layout они преднаполняются дефолтами при открытии экрана, и без этого условия
 * простое «зашёл и вышел» оставляло бы черновик и плашку восстановления на пустом месте.
 */
function isEmptyDraft(draft: SetlistDraft): boolean {
  return draft.songIds.length === 0;
}

function sanitize(raw: unknown): SetlistDraft {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_DRAFT };
  const obj = raw as Partial<StoredDraft>;
  const songIds = Array.isArray(obj.songIds) ? obj.songIds.filter((n): n is number => typeof n === 'number') : [];
  const title = typeof obj.title === 'string' ? obj.title : '';
  const date = typeof obj.date === 'string' ? obj.date : null;
  // Шаг `confirm` без единой песни — тупик (нечего подтверждать), откатываем на выбор.
  const step: SetlistDraftStep = obj.step === 'confirm' && songIds.length > 0 ? 'confirm' : 'pick';
  return { songIds, title, date, step };
}

/**
 * Читает черновик вместе с отметкой времени. Просроченный (и любой без валидного
 * `savedAt` — записи старого формата из sessionStorage сюда не попадут, но ключ мог
 * пережить ручную правку) отбрасывается целиком: `savedAt = null`.
 */
function readStored(now: number = Date.now()): { draft: SetlistDraft; savedAt: number | null } {
  try {
    const raw = localStorage.getItem(SETLIST_DRAFT_STORAGE_KEY);
    if (raw === null) return { draft: { ...EMPTY_DRAFT }, savedAt: null };
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : null;
    if (savedAt === null || now - savedAt > SETLIST_DRAFT_TTL_MS) {
      console.debug('[useSetlistDraft] черновик просрочен или без отметки времени, сброс');
      clearSetlistDraft();
      return { draft: { ...EMPTY_DRAFT }, savedAt: null };
    }
    return { draft: sanitize(parsed), savedAt };
  } catch (err) {
    // Битый JSON в хранилище не должен ронять экран (паттерн useSongViewSettings).
    console.warn('[useSetlistDraft] localStorage недоступен/повреждён, сброс черновика', err);
    return { draft: { ...EMPTY_DRAFT }, savedAt: null };
  }
}

function writeDraft(draft: SetlistDraft): void {
  try {
    const stored: StoredDraft = { ...draft, savedAt: Date.now() };
    localStorage.setItem(SETLIST_DRAFT_STORAGE_KEY, JSON.stringify(stored));
  } catch (err) {
    console.warn('[useSetlistDraft] запись в localStorage не удалась', err);
  }
}

export function clearSetlistDraft(): void {
  try {
    localStorage.removeItem(SETLIST_DRAFT_STORAGE_KEY);
  } catch {
    /* не критично */
  }
}

export function useSetlistDraft() {
  const [initial] = useState(() => readStored());
  const [draft, setDraftState] = useState<SetlistDraft>(initial.draft);
  /**
   * Время сохранения восстановленного черновика — только для плашки «восстановлен».
   * Не `null` лишь когда с прошлого раза остался НЕПУСТОЙ черновик: молча подставлять
   * старый состав нельзя, пользователь должен видеть, что это не новый сет.
   */
  const [restoredAt, setRestoredAt] = useState<number | null>(
    initial.savedAt !== null && !isEmptyDraft(initial.draft) ? initial.savedAt : null
  );

  useEffect(() => {
    // Пока состояние — ровно тот объект, что прочитан из хранилища, писать нечего: иначе
    // простое открытие экрана продлевало бы TTL и создавало запись там, где пользователь
    // ничего не делал. Сравнение по идентичности (а не ref-флаг «первый прогон») — потому
    // что StrictMode в dev прогоняет эффект дважды, и флаг на втором прогоне уже снят.
    if (draft === initial.draft) return;
    if (isEmptyDraft(draft)) {
      clearSetlistDraft();
      return;
    }
    writeDraft(draft);
  }, [draft, initial.draft]);

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
    setRestoredAt(null);
    clearSetlistDraft();
  }, []);

  /** Скрыть плашку восстановления, оставив сам черновик (пользователь продолжает набор). */
  const dismissRestored = useCallback(() => setRestoredAt(null), []);

  return {
    draft,
    restoredAt,
    dismissRestored,
    toggleSong,
    removeSong,
    reorderSongs,
    setStep,
    setTitle,
    setDate,
    setSongIds,
    load,
    clear,
  };
}
