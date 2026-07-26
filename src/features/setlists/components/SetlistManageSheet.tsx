'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Modal } from '@/shared/components/ui/Modal';
import { useIsOnline } from '@/shared/hooks/useIsOnline';
import { useSetlistEditor } from '../hooks/useSetlistEditor';
import { SetlistReorderList, type ReorderableSong } from './SetlistReorderList';
import { AddSongsSheet } from './AddSongsSheet';
import type { SongSummary } from '@/features/songs/types';
import type { SetlistItem } from '../types';

interface SetlistManageSheetProps {
  isOpen: boolean;
  onClose: () => void;
  setlistId: string;
  /** Название сета — заголовок шита. */
  title: string;
  items: SetlistItem[];
  /** Применить новый состав локально: данными владеет экран (страница сета/песни). */
  onItemsChange: (next: SetlistItem[]) => void;
  /** Каталог песен для добавления. Пустой массив, пока грузится. */
  songs: SongSummary[];
  canManageSetlists: boolean;
  /** Песня, открытая сейчас в режиме сета — подсвечивается в списке. */
  currentSongId?: number;
  /** Тап по песне. Не задан — строки некликабельны. */
  onOpenSong?: (songId: number) => void;
  /** Сет удалён целиком — экран решает, куда уходить. */
  onDeleted: () => void;
}

/**
 * Единственное место управления сетом: список песен, порядок, добавление и удаление сета.
 * Открывается и со страницы сета, и из шапки просмотра песни (кнопка «n/m») — экраны
 * остаются read-only, вся правка живёт здесь.
 *
 * Добавление песен показывается ВМЕСТО этого шита (`mode`), а не поверх: два BottomSheet
 * с одинаковым z-index накладывались бы друг на друга.
 */
export const SetlistManageSheet: React.FC<SetlistManageSheetProps> = ({
  isOpen,
  onClose,
  setlistId,
  title,
  items,
  onItemsChange,
  songs,
  canManageSetlists,
  currentSongId,
  onOpenSong,
  onDeleted,
}) => {
  const isOnline = useIsOnline();
  const [mode, setMode] = useState<'list' | 'add'>('list');
  const [confirmRemove, setConfirmRemove] = useState<SetlistItem | null>(null);
  const [confirmDeleteSetlist, setConfirmDeleteSetlist] = useState(false);

  const editor = useSetlistEditor({ setlistId, items, onItemsChange, songs, onDeleted });
  const isEditable = canManageSetlists && isOnline;

  /** Мемоизация обязательна — `Reorder` сопоставляет строки по идентичности объектов. */
  const reorderable: ReorderableSong[] = useMemo(
    () => items.map((item) => ({ id: item.songId, title: item.title, subtitle: item.subtitle, songKey: item.songKey })),
    [items]
  );

  const closeAll = () => {
    setMode('list');
    onClose();
  };

  return (
    <>
      <BottomSheet isOpen={isOpen && mode === 'list'} onClose={closeAll} title={title}>
        <div data-setlist-manage-sheet className="flex flex-col gap-3">
          <SetlistReorderList
            items={reorderable}
            editable={isEditable}
            currentSongId={currentSongId}
            onReorder={editor.reorder}
            onRemove={isEditable ? (songId) => setConfirmRemove(items.find((i) => i.songId === songId) ?? null) : undefined}
            onOpen={onOpenSong}
          />

          {items.length === 0 && <p className="py-6 text-center text-app-text-muted">В сете пока нет песен</p>}

          {editor.error && (
            <p role="alert" data-setlist-manage-sheet-error className="text-sm text-app-missed-text">
              {editor.error}
            </p>
          )}

          {canManageSetlists && (
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                data-setlist-manage-sheet-add
                disabled={!isOnline || editor.submitting}
                onClick={() => setMode('add')}
                className="flex w-full items-center justify-center gap-2 rounded-app-md border-2 border-app-primary px-4 py-2.5 text-sm font-medium text-app-primary transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={18} aria-hidden />
                {isOnline ? 'Добавить песню' : 'Нужен интернет'}
              </button>

              <button
                type="button"
                data-setlist-manage-sheet-delete
                disabled={!isOnline || editor.deleting}
                onClick={() => setConfirmDeleteSetlist(true)}
                className="flex w-full items-center justify-center gap-2 rounded-app-md px-4 py-2.5 text-sm font-medium text-app-missed-text transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={16} aria-hidden />
                {isOnline ? 'Удалить сет' : 'Нужен интернет, чтобы удалить'}
              </button>
            </div>
          )}
        </div>
      </BottomSheet>

      <AddSongsSheet
        isOpen={isOpen && mode === 'add'}
        onClose={() => setMode('list')}
        songs={songs}
        existingSongIds={items.map((item) => item.songId)}
        onAdd={(songIds) => {
          setMode('list');
          editor.add(songIds);
        }}
        submitting={editor.submitting}
      />

      <Modal isOpen={confirmRemove !== null} onClose={() => setConfirmRemove(null)} title="Убрать песню?">
        <div className="space-y-4">
          <p className="text-app-text-secondary">«{confirmRemove?.title}» будет убрана из сета.</p>
          <div className="flex gap-2">
            <button
              type="button"
              data-setlist-manage-sheet-remove-confirm
              onClick={() => {
                if (confirmRemove) editor.remove(confirmRemove.songId);
                setConfirmRemove(null);
              }}
              className="flex-1 rounded-app-md bg-app-missed-text px-4 py-2.5 text-sm font-semibold text-app-text-inverse"
            >
              Убрать
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(null)}
              className="flex-1 rounded-app-md border-2 border-app-border px-4 py-2.5 text-sm font-medium text-app-text-secondary"
            >
              Отмена
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirmDeleteSetlist}
        onClose={() => setConfirmDeleteSetlist(false)}
        title="Удалить сет?"
      >
        <div className="space-y-4">
          <p className="text-app-text-secondary">«{title}» будет удалён без возможности восстановления.</p>
          {editor.error && (
            <p className="text-sm text-app-missed-text" role="alert">
              {editor.error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              data-setlist-manage-sheet-delete-confirm
              disabled={editor.deleting}
              onClick={() => void editor.removeSetlist()}
              className="flex-1 rounded-app-md bg-app-missed-text px-4 py-2.5 text-sm font-semibold text-app-text-inverse disabled:opacity-60"
            >
              {editor.deleting ? 'Удаление…' : 'Да, удалить'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteSetlist(false)}
              disabled={editor.deleting}
              className="flex-1 rounded-app-md border-2 border-app-border px-4 py-2.5 text-sm font-medium text-app-text-secondary"
            >
              Отмена
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SetlistManageSheet;
