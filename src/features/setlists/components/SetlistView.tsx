'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { formatSetlistDate } from '../lib/formatSetlistDate';
import { setlistsApi } from '@/shared/services/api/endpoints';
import { setlistCacheKey, SETLISTS_LIST_CACHE_KEY } from '../lib/offlineSetlists';
import { getDB } from '@/shared/offline/db';
import { Modal } from '@/shared/components/ui/Modal';
import { useIsOnline } from '@/shared/hooks/useIsOnline';
import { useSaveSetlist } from '../hooks/useSaveSetlist';
import { SetlistReorderList, type ReorderableSong } from './SetlistReorderList';
import { AddSongsSheet } from './AddSongsSheet';
import type { SongSummary } from '@/features/songs/types';
import type { Setlist, SetlistItem } from '../types';

interface SetlistViewProps {
  setlist: Setlist;
  canManageSetlists: boolean;
  /** Каталог песен для шита добавления. Пустой массив, пока грузится. */
  songs: SongSummary[];
}

/** Инвалидирует apiCache сета/списка после удаления — следующий readThrough увидит свежие данные. */
async function invalidateSetlistCache(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('apiCache', setlistCacheKey(id));
    await db.delete('apiCache', SETLISTS_LIST_CACHE_KEY);
  } catch (err) {
    console.debug('[SetlistView] cache invalidation failed', err);
  }
}

export const SetlistView: React.FC<SetlistViewProps> = ({ setlist, canManageSetlists, songs }) => {
  const router = useRouter();
  const isOnline = useIsOnline();
  const { update, submitting, error: saveError, resetError } = useSaveSetlist();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  /**
   * Локальная копия состава — источник правды для UI между оптимистичным изменением
   * и ответом сервера. При провале PATCH откатываем её обратно, иначе экран показывал бы
   * порядок, которого на сервере нет.
   */
  const [items, setItems] = useState<SetlistItem[]>(setlist.items);

  useEffect(() => {
    // Индирекция вместо прямого setState в теле эффекта (react-hooks/set-state-in-effect).
    const syncFromServer = () => setItems(setlist.items);
    syncFromServer();
  }, [setlist.items]);

  const isEditable = canManageSetlists && isOnline;

  console.debug(`[SetlistView] id=${setlist.id} items=${items.length} editable=${isEditable}`);

  /** Мемоизация обязательна — `Reorder` сопоставляет строки по идентичности объектов. */
  const reorderable: ReorderableSong[] = useMemo(
    () => items.map((item) => ({ id: item.songId, title: item.title, subtitle: item.subtitle, songKey: item.songKey })),
    [items]
  );

  const openSong = (songId: number) =>
    router.push(
      `/dashboard/song?id=${encodeURIComponent(String(songId))}&setlistId=${encodeURIComponent(setlist.id)}`
    );

  /** Общий путь всех правок состава: оптимистично применяем, при ошибке откатываем. */
  const persist = async (nextItems: SetlistItem[]) => {
    const previous = items;
    setItems(nextItems);
    resetError();
    const result = await update(setlist.id, { songIds: nextItems.map((item) => item.songId) });
    if (result === null) {
      console.warn('[SetlistView] PATCH состава не прошёл, откатываем порядок');
      setItems(previous);
    }
  };

  const handleReorder = (songIds: number[]) => {
    const byId = new Map(items.map((item) => [item.songId, item]));
    const next = songIds.map((id) => byId.get(id)).filter((item): item is SetlistItem => !!item);
    // Состав обязан совпасть — иначе PATCH уехал бы усечённым списком.
    if (next.length !== items.length) {
      console.warn('[SetlistView] reorder отклонён: состав не совпадает', { incoming: songIds });
      return;
    }
    void persist(next);
  };

  const handleRemove = (songId: number) => {
    void persist(items.filter((item) => item.songId !== songId));
  };

  const handleAdd = (songIds: number[]) => {
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
    setIsAddOpen(false);
    void persist([...items, ...added]);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await setlistsApi.remove(setlist.id);
      await invalidateSetlistCache(setlist.id);
      console.warn(`[SetlistView] deleted setlist ${setlist.id}`);
      router.replace('/dashboard/setlists');
    } catch (err) {
      console.error('[SetlistView] delete failed', err);
      setDeleteError(err instanceof Error ? err.message : 'Не удалось удалить сет');
      setDeleting(false);
    }
  };

  return (
    <div data-setlist-view className="flex flex-col gap-4 px-4 pt-3 pb-8">
      <div>
        <p data-setlist-view-date className="text-sm font-medium text-app-text-muted">
          {formatSetlistDate(setlist.date)}
        </p>
        <h1 data-setlist-view-title className="text-xl font-bold text-app-text">
          {setlist.title}
        </h1>
      </div>

      <SetlistReorderList
        items={reorderable}
        editable={isEditable}
        onReorder={handleReorder}
        onRemove={handleRemove}
        onOpen={openSong}
      />

      {items.length === 0 && <p className="py-8 text-center text-app-text-muted">В сете пока нет песен</p>}

      {saveError && (
        <p role="alert" data-setlist-view-save-error className="text-sm text-app-missed-text">
          {saveError}
        </p>
      )}

      {canManageSetlists && (
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            data-setlist-view-add-song
            disabled={!isOnline || submitting}
            onClick={() => setIsAddOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-app-md border-2 border-app-primary px-4 py-2.5 text-sm font-medium text-app-primary transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={18} aria-hidden />
            {isOnline ? 'Добавить песню' : 'Нужен интернет'}
          </button>

          <div className="mt-4 border-t border-app-border pt-4">
            {!confirmingDelete ? (
              <button
                type="button"
                data-setlist-view-delete
                disabled={!isOnline}
                onClick={() => setConfirmingDelete(true)}
                className="w-full rounded-app-md border-2 border-app-missed-text px-4 py-2.5 text-sm font-medium text-app-missed-text transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isOnline ? 'Удалить сет' : 'Нужен интернет, чтобы удалить'}
              </button>
            ) : (
              <p className="text-sm text-app-text-secondary">Удаление подтверждается в диалоге.</p>
            )}
          </div>
        </div>
      )}

      <AddSongsSheet
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        songs={songs}
        existingSongIds={items.map((item) => item.songId)}
        onAdd={handleAdd}
        submitting={submitting}
      />

      <Modal isOpen={confirmingDelete} onClose={() => setConfirmingDelete(false)} title="Удалить сет?">
        <div className="space-y-4">
          <p className="text-app-text-secondary">
            «{setlist.title}» будет удалён без возможности восстановления.
          </p>
          {deleteError && (
            <p className="text-sm text-app-missed-text" role="alert">
              {deleteError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              data-setlist-view-delete-confirm
              disabled={deleting}
              onClick={handleDelete}
              className="flex-1 rounded-app-md bg-app-missed-text px-4 py-2.5 text-sm font-semibold text-app-text-inverse disabled:opacity-60"
            >
              {deleting ? 'Удаление…' : 'Да, удалить'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="flex-1 rounded-app-md border-2 border-app-border px-4 py-2.5 text-sm font-medium text-app-text-secondary"
            >
              Отмена
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SetlistView;
