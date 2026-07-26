'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatSetlistDate } from '../lib/formatSetlistDate';
import { setlistsApi } from '@/shared/services/api/endpoints';
import { setlistCacheKey, SETLISTS_LIST_CACHE_KEY } from '../lib/offlineSetlists';
import { getDB } from '@/shared/offline/db';
import { Modal } from '@/shared/components/ui/Modal';
import { useIsOnline } from '@/shared/hooks/useIsOnline';
import type { Setlist } from '../types';

interface SetlistViewProps {
  setlist: Setlist;
  canManageSetlists: boolean;
}

/** Инвалидирует apiCache сета/списка после мутации — следующий readThrough увидит свежие данные. */
async function invalidateSetlistCache(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('apiCache', setlistCacheKey(id));
    await db.delete('apiCache', SETLISTS_LIST_CACHE_KEY);
  } catch (err) {
    console.debug('[SetlistView] cache invalidation failed', err);
  }
}

export const SetlistView: React.FC<SetlistViewProps> = ({ setlist, canManageSetlists }) => {
  const router = useRouter();
  const isOnline = useIsOnline();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  console.debug(`[SetlistView] id=${setlist.id} items=${setlist.items.length}`);

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

      <ul data-setlist-view-items className="flex flex-col gap-2">
        {setlist.items.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              data-setlist-view-item
              onClick={() =>
                router.push(
                  `/dashboard/song?id=${encodeURIComponent(String(item.songId))}&setlistId=${encodeURIComponent(setlist.id)}`
                )
              }
              className="flex w-full items-center gap-3 rounded-app-md border border-app-border bg-app-surface px-4 py-3 text-left shadow-app-sm transition-transform active:scale-[0.98]"
            >
              <span className="w-5 shrink-0 text-sm text-app-text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-app-text">{item.title}</h3>
                {item.subtitle && <p className="truncate text-sm text-app-text-secondary">{item.subtitle}</p>}
              </div>
              {item.songKey && (
                <span className="shrink-0 rounded-full bg-app-primary-muted px-2.5 py-1 text-xs font-semibold text-app-primary">
                  {item.songKey}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {canManageSetlists && (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            data-setlist-view-edit
            disabled={!isOnline}
            onClick={() => router.push(`/dashboard/setlist-edit?id=${encodeURIComponent(setlist.id)}`)}
            className="w-full rounded-app-md border-2 border-app-primary px-4 py-2.5 text-sm font-medium text-app-primary transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isOnline ? 'Изменить' : 'Нужен интернет'}
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
