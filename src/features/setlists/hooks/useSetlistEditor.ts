'use client';

import { useCallback, useState } from 'react';
import { setlistsApi } from '@/shared/services/api/endpoints';
import { getDB } from '@/shared/offline/db';
import { setlistCacheKey, SETLISTS_LIST_CACHE_KEY } from '../lib/offlineSetlists';
import { resetSetlistsCache } from './useSetlists';
import { useSaveSetlist } from './useSaveSetlist';
import type { SongSummary } from '@/features/songs/types';
import type { SetlistItem } from '../types';

interface UseSetlistEditorArgs {
  setlistId: string;
  items: SetlistItem[];
  /** Применить новый состав локально (владелец данных — вызывающий экран). */
  onItemsChange: (next: SetlistItem[]) => void;
  /** Каталог песен — источник title/key для добавляемых строк. */
  songs: SongSummary[];
  /** Сет удалён целиком: вызывающий решает, куда уходить с экрана. */
  onDeleted: () => void;
}

export interface SetlistEditorApi {
  reorder: (songIds: number[]) => void;
  remove: (songId: number) => void;
  add: (songIds: number[]) => void;
  removeSetlist: () => Promise<void>;
  submitting: boolean;
  deleting: boolean;
  error: string | null;
  resetError: () => void;
}

/**
 * Правка состава сета — единая точка для страницы сета и режима просмотра песни.
 * Каждая правка применяется оптимистично и откатывается при провале PATCH: иначе экран
 * показывал бы порядок, которого на сервере нет. Запись сознательно online-only
 * (см. `docs/offline-pwa.md`), поэтому outbox тут не задействован.
 */
export function useSetlistEditor({
  setlistId,
  items,
  onItemsChange,
  songs,
  onDeleted,
}: UseSetlistEditorArgs): SetlistEditorApi {
  const { update, submitting, error, resetError } = useSaveSetlist();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const persist = useCallback(
    async (nextItems: SetlistItem[]) => {
      const previous = items;
      onItemsChange(nextItems);
      resetError();
      const result = await update(setlistId, { songIds: nextItems.map((item) => item.songId) });
      if (result === null) {
        console.warn('[useSetlistEditor] PATCH состава не прошёл, откатываем');
        onItemsChange(previous);
      }
    },
    [items, onItemsChange, resetError, setlistId, update]
  );

  const reorder = useCallback(
    (songIds: number[]) => {
      const byId = new Map(items.map((item) => [item.songId, item]));
      const next = songIds.map((id) => byId.get(id)).filter((item): item is SetlistItem => !!item);
      // Состав обязан совпасть — иначе PATCH уехал бы усечённым списком.
      if (next.length !== items.length) {
        console.warn('[useSetlistEditor] reorder отклонён: состав не совпадает', { incoming: songIds });
        return;
      }
      void persist(next);
    },
    [items, persist]
  );

  const remove = useCallback(
    (songId: number) => {
      void persist(items.filter((item) => item.songId !== songId));
    },
    [items, persist]
  );

  const add = useCallback(
    (songIds: number[]) => {
      const added: SetlistItem[] = songIds.flatMap((songId) => {
        const song = songs.find((s) => Number(s.id) === songId);
        if (!song) return [];
        return [
          {
            // Временный id строки: сервер выдаст настоящий, но до перезагрузки
            // нужен стабильный React-key, не совпадающий с существующими.
            id: `pending-${songId}`,
            sort: items.length,
            songId,
            title: song.title,
            subtitle: song.subtitle ?? undefined,
            songKey: song.key ?? undefined,
          },
        ];
      });
      if (added.length === 0) return;
      void persist([...items, ...added]);
    },
    [items, persist, songs]
  );

  const removeSetlist = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await setlistsApi.remove(setlistId);
      resetSetlistsCache();
      try {
        const db = await getDB();
        await db.delete('apiCache', setlistCacheKey(setlistId));
        await db.delete('apiCache', SETLISTS_LIST_CACHE_KEY);
      } catch (cacheErr) {
        console.debug('[useSetlistEditor] cache invalidation failed', cacheErr);
      }
      console.warn(`[useSetlistEditor] deleted setlist ${setlistId}`);
      onDeleted();
    } catch (err) {
      console.error('[useSetlistEditor] delete failed', err);
      setDeleteError(err instanceof Error ? err.message : 'Не удалось удалить сет');
      setDeleting(false);
    }
  }, [onDeleted, setlistId]);

  return {
    reorder,
    remove,
    add,
    removeSetlist,
    submitting,
    deleting,
    error: deleteError ?? error,
    resetError: () => {
      setDeleteError(null);
      resetError();
    },
  };
}
