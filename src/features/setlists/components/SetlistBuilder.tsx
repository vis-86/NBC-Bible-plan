'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { SearchBar } from '@/shared/components/ui/SearchBar';
import { useSongSearch } from '@/features/songs/hooks/useSongSearch';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useSetlistDraft } from '../hooks/useSetlistDraft';
import { SetlistSongPickRow } from './SetlistSongPickRow';
import { SelectedChipsRow } from './SelectedChipsRow';
import { SetlistItemRow } from './SetlistItemRow';
import { NameSetlistSheet } from './NameSetlistSheet';
import type { SongSummary } from '@/features/songs/types';
import type { Setlist } from '../types';

/** Планшет (≥768px) — Master-Detail: правая панель вместо ленты chips/FAB/шита (T14). */
export const SETLIST_WIDE_LAYOUT_QUERY = '(min-width: 768px)';

interface SetlistBuilderProps {
  songs: SongSummary[];
  /** Присутствует ⇒ редактирование существующего сета (PATCH), иначе — создание (POST). */
  editingId?: string | null;
  /** Деталь редактируемого сета — для предзаполнения черновика (null, пока грузится). */
  initialSetlist?: Setlist | null;
}

export const SetlistBuilder: React.FC<SetlistBuilderProps> = ({ songs, editingId, initialSetlist }) => {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const isWideLayout = useMediaQuery(SETLIST_WIDE_LAYOUT_QUERY);
  const { draft, toggleSong, removeSong, moveSong, setTitle, setDate, load, clear } = useSetlistDraft();
  const [query, setQuery] = useState('');
  const [isNameSheetOpen, setIsNameSheetOpen] = useState(false);

  // Предзаполнение черновика при входе в редактирование: только когда черновик
  // ещё не относится к этому сету (иначе перезаписали бы незавершённую правку
  // пользователя актуальными данными с сервера при каждом ремонтировании).
  const prefilledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editingId) {
      if (draft.editingId !== null && prefilledRef.current !== 'create') {
        prefilledRef.current = 'create';
        clear();
      }
      return;
    }
    if (draft.editingId === editingId) return;
    if (!initialSetlist) return;
    prefilledRef.current = editingId;
    load({
      editingId,
      title: initialSetlist.title,
      date: initialSetlist.date,
      songIds: initialSetlist.items.map((item) => item.songId),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear/load стабильны (useCallback), draft исключён намеренно (иначе цикл).
  }, [editingId, initialSetlist]);

  const results = useSongSearch(songs, query);
  const songById = useMemo(() => new Map(songs.map((s) => [Number(s.id), s])), [songs]);
  const selectedSongs = draft.songIds.map((id) => songById.get(id)).filter((s): s is SongSummary => !!s);

  const hasSelection = draft.songIds.length > 0;

  const handleCancel = () => {
    if (hasSelection) {
      const confirmed = window.confirm('Отменить создание сета? Выбранные песни будут потеряны.');
      if (!confirmed) return;
    }
    clear();
    router.push(editingId ? `/dashboard/setlist?id=${encodeURIComponent(editingId)}` : '/dashboard/songs');
  };

  const handleSuccess = (id: string) => {
    clear();
    setIsNameSheetOpen(false);
    router.replace(`/dashboard/setlist?id=${encodeURIComponent(id)}&created=1`);
  };

  const titleSection = (
    <div className="space-y-4">
      <div>
        <label htmlFor="setlist-title-input-desktop" className="mb-1.5 block text-sm font-medium text-app-text-secondary">
          Название сета
        </label>
        <input
          id="setlist-title-input-desktop"
          data-setlist-builder-title-input
          type="text"
          maxLength={100}
          value={draft.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например, Воскресное утро"
          className="w-full rounded-app-md border border-app-border bg-app-surface px-3 py-2.5 text-app-text outline-none transition-colors focus:border-app-primary"
        />
      </div>
      <div>
        <label htmlFor="setlist-date-input-desktop" className="mb-1.5 block text-sm font-medium text-app-text-secondary">
          Дата (необязательно)
        </label>
        <input
          id="setlist-date-input-desktop"
          data-setlist-builder-date-input
          type="date"
          value={draft.date ?? ''}
          onChange={(e) => setDate(e.target.value || null)}
          className="w-full rounded-app-md border border-app-border bg-app-surface px-3 py-2.5 text-app-text outline-none transition-colors focus:border-app-primary"
        />
      </div>
    </div>
  );

  const reorderList =
    selectedSongs.length > 0 ? (
      <ul data-setlist-builder-reorder-list className="flex flex-col gap-2">
        {selectedSongs.map((song, i) => (
          <SetlistItemRow
            key={song.id}
            song={song}
            index={i}
            total={selectedSongs.length}
            onMoveUp={() => moveSong(i, -1)}
            onMoveDown={() => moveSong(i, 1)}
          />
        ))}
      </ul>
    ) : null;

  const pickList = (
    <div role="listbox" aria-multiselectable="true" data-setlist-builder-pick-list className="flex flex-col gap-2">
      {results.length === 0 ? (
        <p className="py-8 text-center text-app-text-muted">Ничего не найдено</p>
      ) : (
        results.map((song, i) => {
          const songId = Number(song.id);
          const selected = draft.songIds.includes(songId);
          return (
            <motion.div
              key={song.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i * 0.01, 0.2) }}
            >
              <SetlistSongPickRow song={song} selected={selected} onToggle={() => toggleSong(songId)} />
            </motion.div>
          );
        })
      )}
    </div>
  );

  if (isWideLayout) {
    return (
      <div data-setlist-builder className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="flex min-h-0 w-2/3 flex-col gap-3">
          <SearchBar onSearch={setQuery} placeholder="Поиск по песням" />
          <div className="min-h-0 flex-1 overflow-y-auto">{pickList}</div>
        </div>
        <div className="flex min-h-0 w-1/3 flex-col gap-4 overflow-y-auto border-l border-app-border pl-4">
          {titleSection}
          {reorderList}
          <button
            type="button"
            data-setlist-builder-submit-desktop
            disabled={draft.title.trim().length === 0 || draft.songIds.length === 0}
            onClick={() => setIsNameSheetOpen(true)}
            className="w-full rounded-app-md bg-app-primary px-4 py-2.5 text-sm font-semibold text-app-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>

        <NameSetlistSheet
          isOpen={isNameSheetOpen}
          onClose={() => setIsNameSheetOpen(false)}
          initialTitle={draft.title}
          initialDate={draft.date}
          songIds={draft.songIds}
          editingId={editingId}
          onSuccess={handleSuccess}
        />
      </div>
    );
  }

  return (
    <div data-setlist-builder className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-app-border bg-app-surface px-4 py-3">
        <button
          type="button"
          data-setlist-builder-cancel
          aria-label="Отменить"
          onClick={handleCancel}
          className="rounded-app-sm p-2 text-app-text-secondary transition-transform active:scale-90"
        >
          <X size={20} />
        </button>
        <h1 className="flex-1 truncate text-center font-semibold text-app-text">
          {editingId ? 'Редактирование сета' : 'Новый сет'}
        </h1>
        <span aria-live="polite" data-setlist-builder-count className="shrink-0 text-sm text-app-text-secondary">
          Выбрано: {draft.songIds.length}
        </span>
      </div>

      <div className="sticky top-[57px] z-10 bg-app-surface px-4 py-2">
        <SearchBar onSearch={setQuery} placeholder="Поиск по песням" />
      </div>

      <SelectedChipsRow
        items={selectedSongs.map((s) => ({ songId: Number(s.id), title: s.title }))}
        onRemove={removeSong}
      />

      {editingId && reorderList && (
        <div className="px-4 pb-2">
          <h2 className="mb-2 text-sm font-medium text-app-text-secondary">Порядок в сете</h2>
          {reorderList}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-24">{pickList}</div>

      <div
        className="fixed inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-app-bg via-app-bg/90 to-transparent px-4 pb-4 pt-8"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          data-setlist-builder-next
          disabled={!hasSelection}
          aria-disabled={!hasSelection}
          onClick={() => setIsNameSheetOpen(true)}
          className="w-full max-w-sm rounded-full bg-app-primary px-6 py-3.5 text-base font-semibold text-app-text-inverse shadow-app-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Далее →
        </button>
      </div>

      <NameSetlistSheet
        isOpen={isNameSheetOpen}
        onClose={() => setIsNameSheetOpen(false)}
        initialTitle={draft.title}
        initialDate={draft.date}
        songIds={draft.songIds}
        editingId={editingId}
        onSuccess={handleSuccess}
      />
    </div>
  );
};

export default SetlistBuilder;
