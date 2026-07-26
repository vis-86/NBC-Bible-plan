'use client';

import { Check } from 'lucide-react';
import type { SongSummary } from '@/features/songs/types';

interface SetlistSongPickRowProps {
  song: SongSummary;
  selected: boolean;
  onToggle: () => void;
}

/**
 * Строка выбора песни в билдере сета. Вся строка — тап-таргет (не только чекбокс),
 * `role="option" aria-selected` внутри `role="listbox"` родителя.
 */
export const SetlistSongPickRow: React.FC<SetlistSongPickRowProps> = ({ song, selected, onToggle }) => {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-setlist-builder-pick-row
      data-setlist-builder-pick-row-selected={selected}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-app-md border border-app-border bg-app-surface px-4 py-3 text-left shadow-app-sm transition-transform active:scale-[0.98] data-[setlist-builder-pick-row-selected=true]:border-app-primary data-[setlist-builder-pick-row-selected=true]:bg-app-primary-muted"
    >
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-app-border data-[checked=true]:border-app-primary data-[checked=true]:bg-app-primary"
        data-checked={selected}
      >
        {selected && <Check size={14} className="text-app-text-inverse" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-app-text">{song.title}</h3>
        {song.subtitle && <p className="truncate text-sm text-app-text-secondary">{song.subtitle}</p>}
      </div>
      {song.key && (
        <span className="shrink-0 rounded-full bg-app-primary-muted px-2.5 py-1 text-xs font-semibold text-app-primary">
          {song.key}
        </span>
      )}
    </button>
  );
};

export default SetlistSongPickRow;
