'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import type { SongSummary } from '@/features/songs/types';

interface SetlistItemRowProps {
  song: SongSummary;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/**
 * Строка выбранной песни с переупорядочиванием. Обязательная a11y-альтернатива
 * drag-reorder — кнопки «Вверх»/«Вниз» работают без мыши/тача (см. план, «Drag-reorder»).
 */
export const SetlistItemRow: React.FC<SetlistItemRowProps> = ({ song, index, total, onMoveUp, onMoveDown }) => {
  return (
    <li
      data-setlist-builder-item
      className="flex items-center gap-2 rounded-app-md border border-app-border bg-app-surface px-3 py-2 shadow-app-sm"
    >
      <span className="w-5 shrink-0 text-sm text-app-text-muted">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-app-text">{song.title}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          data-setlist-builder-item-up
          aria-label={`Переместить «${song.title}» вверх`}
          disabled={index === 0}
          onClick={onMoveUp}
          className="rounded-app-sm p-2 text-app-text-secondary transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronUp size={18} />
        </button>
        <button
          type="button"
          data-setlist-builder-item-down
          aria-label={`Переместить «${song.title}» вниз`}
          disabled={index === total - 1}
          onClick={onMoveDown}
          className="rounded-app-sm p-2 text-app-text-secondary transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    </li>
  );
};

export default SetlistItemRow;
