'use client';

import { GripVertical, X } from 'lucide-react';
import type { ReorderableSong } from './SetlistReorderList';

interface SetlistItemRowProps {
  song: ReorderableSong;
  index: number;
  /** `true` — показываем ручку `⠿` и крестик удаления (правка состава). */
  editable: boolean;
  /** Открыть песню. Не задан — область названия не кликабельна. */
  onOpen?: () => void;
  onRemove?: () => void;
  /**
   * Строку сейчас тащат (@dnd-kit). Гасит открытие песни на «клике», который
   * браузер иногда шлёт после дропа без смещения указателя.
   */
  isDragging?: boolean;
}

/**
 * Внутреннее содержимое строки сета (ручка / номер / название / тональность / крестик).
 * Внешний элемент (`<li>` или sortable-обёртка) и вся drag-механика — в `SetlistReorderList`
 * (на @dnd-kit с `DragOverlay`). Здесь только разметка, общая для обоих режимов.
 *
 * Перетаскивание — за строку целиком (listeners висят на внешнем `<li>`). Кнопки внутри
 * гасят `pointerDown`, чтобы нажатие на них не стартовало drag; тап по названию открывает
 * песню, реальный drag (>6px) клик не порождает.
 */
export const SetlistItemRow: React.FC<SetlistItemRowProps> = ({
  song,
  index,
  editable,
  onOpen,
  onRemove,
  isDragging = false,
}) => {
  const handleOpen = () => {
    if (isDragging) return;
    onOpen?.();
  };

  return (
    <>
      {editable && (
        <span
          aria-hidden
          className="shrink-0 cursor-grab p-1 text-app-text-muted active:cursor-grabbing"
        >
          <GripVertical size={18} />
        </span>
      )}
      <span className="w-5 shrink-0 text-center text-sm text-app-text-muted">{index + 1}</span>

      {onOpen ? (
        <button type="button" data-setlist-view-item onClick={handleOpen} className="min-w-0 flex-1 py-3 text-left">
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
          // Гасим pointerDown, иначе нажатие на крестик стартует drag строки.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 rounded-app-sm p-2.5 text-app-text-secondary transition-transform active:scale-90"
        >
          <X size={18} />
        </button>
      )}
    </>
  );
};

export default SetlistItemRow;
