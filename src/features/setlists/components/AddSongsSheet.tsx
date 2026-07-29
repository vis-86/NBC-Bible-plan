'use client';

import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { SearchBar } from '@/shared/components/ui/SearchBar';
import { useSongSearch } from '@/features/songs/hooks/useSongSearch';
import { SetlistSongPickRow } from './SetlistSongPickRow';
import type { SongSummary } from '@/features/songs/types';

interface AddSongsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  songs: SongSummary[];
  /** id песен, уже входящих в сет — показываются отмеченными и не переключаются. */
  existingSongIds: number[];
  /** Отдаёт ТОЛЬКО новые id, в порядке выбора. */
  onAdd: (songIds: number[]) => void;
  submitting?: boolean;
}

/** Добавление песен в уже созданный сет: поиск + галочки + кнопка «Добавить». */
export const AddSongsSheet: React.FC<AddSongsSheetProps> = ({
  isOpen,
  onClose,
  songs,
  existingSongIds,
  onAdd,
  submitting = false,
}) => {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number[]>([]);

  useEffect(() => {
    // Индирекция вместо прямого setState в теле эффекта (react-hooks/set-state-in-effect).
    const resetOnOpen = () => {
      setPicked([]);
      setQuery('');
    };
    if (isOpen) resetOnOpen();
  }, [isOpen]);

  // Порядок (название → текст) приходит из хука; здесь нужен только сам список песен.
  const results = useSongSearch(songs, query).map((hit) => hit.song);
  const existing = useMemo(() => new Set(existingSongIds), [existingSongIds]);

  const toggle = (songId: number) => {
    if (existing.has(songId)) return; // Уже в сете — повторно не добавляем.
    setPicked((prev) => (prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId]));
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Добавить песню">
      <div className="flex flex-col gap-3">
        <SearchBar onSearch={setQuery} placeholder="Поиск по песням" />

        <div
          role="listbox"
          aria-multiselectable="true"
          data-add-songs-sheet-list
          className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto"
        >
          {results.length === 0 ? (
            <p className="py-8 text-center text-app-text-muted">Ничего не найдено</p>
          ) : (
            results.map((song) => {
              const songId = Number(song.id);
              const inSetlist = existing.has(songId);
              return (
                <div key={song.id} className={inSetlist ? 'pointer-events-none opacity-50' : undefined}>
                  <SetlistSongPickRow
                    song={song}
                    selected={inSetlist || picked.includes(songId)}
                    onToggle={() => toggle(songId)}
                  />
                </div>
              );
            })
          )}
        </div>

        <button
          type="button"
          data-add-songs-sheet-submit
          disabled={picked.length === 0 || submitting}
          onClick={() => onAdd(picked)}
          className="w-full rounded-app-md bg-app-primary px-4 py-2.5 text-sm font-semibold text-app-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Добавление…' : `Добавить${picked.length > 0 ? ` (${picked.length})` : ''}`}
        </button>
      </div>
    </BottomSheet>
  );
};

export default AddSongsSheet;
