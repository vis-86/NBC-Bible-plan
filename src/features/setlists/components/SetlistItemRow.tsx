'use client';

import { X } from 'lucide-react';
import type { ReorderableSong } from './SetlistReorderList';

interface SetlistItemRowProps {
  song: ReorderableSong;
  index: number;
  /** `true` — показываем ручку `⠿` и крестик удаления (правка состава). */
  editable: boolean;
  /** Открыть песню. Не задан — область названия не кликабельна. */
  onOpen?: () => void;
  onRemove?: () => void;
  /** Ручка `⠿` — активатор drag, рендерится sortable-обёрткой (у неё listeners @dnd-kit). */
  dragHandle?: React.ReactNode;
}

/**
 * Внутреннее содержимое строки сета (ручка / номер / название / тональность / крестик).
 * Внешний элемент (`<li>` или sortable-обёртка) и вся drag-механика — в `SetlistReorderList`
 * (на @dnd-kit). Здесь только разметка, общая для обоих режимов.
 *
 * Перетаскивание — ТОЛЬКО за ручку `⠿`: остальная строка отдаёт вертикальный свайп браузеру
 * под скролл списка. `touch-action: none` — только на ручке, иначе телефон забирает тач
 * под скролл и drag не стартует.
 */
export const SetlistItemRow: React.FC<SetlistItemRowProps> = ({
  song,
  index,
  editable,
  onOpen,
  onRemove,
  dragHandle,
}) => {
  return (
    <>
      {editable && dragHandle}
      <span className="w-5 shrink-0 text-center text-sm text-app-text-muted">{index + 1}</span>

      {onOpen ? (
        <button type="button" data-setlist-view-item onClick={onOpen} className="min-w-0 flex-1 py-3 text-left">
          <span className="block truncate font-semibold text-app-text">{song.title}</span>
          {song.subtitle && <span className="block truncate text-sm text-app-text-secondary">{song.subtitle}</span>}
        </button>
      ) : (
        <div className="min-w-0 flex-1 py-3">
          <p className="truncate font-medium text-app-text">{song.title}</p>
          {song.subtitle && <p className="truncate text-sm text-app-text-secondary">{song.subtitle}</p>}
        </div>
      )}

      {song.songKey && (
        <span className="shrink-0 rounded-full bg-app-primary-muted px-2.5 py-1 text-xs font-semibold text-app-primary">
          {song.songKey}
        </span>
      )}

      {editable && onRemove && (
        <button
          type="button"
          data-setlist-builder-item-remove
          aria-label={`Убрать «${song.title}» из сета`}
          onClick={onRemove}
          className="shrink-0 rounded-app-sm p-2.5 text-app-text-secondary transition-transform active:scale-90"
        >
          <X size={18} />
        </button>
      )}
    </>
  );
};

export default SetlistItemRow;
