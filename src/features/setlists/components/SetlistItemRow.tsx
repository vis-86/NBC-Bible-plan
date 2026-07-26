'use client';

import { useRef } from 'react';
import { GripVertical, X } from 'lucide-react';
import { Reorder } from 'motion/react';
import type { ReorderableSong } from './SetlistReorderList';

interface SetlistItemRowProps {
  song: ReorderableSong;
  index: number;
  /**
   * `true` — строка перетаскивается (`Reorder.Item`) и показывает ручку с крестиком.
   * `false` — обычный `<li>` без drag: у читателя и офлайн правки состава нет.
   */
  editable: boolean;
  /** Открыть песню. Не задан — строка не кликабельна. */
  onOpen?: () => void;
  onRemove?: () => void;
  /** Песня, открытая сейчас в режиме сета — подсвечивается. */
  current?: boolean;
}

const ROW_CLASS =
  'flex items-center gap-2 rounded-app-md border border-app-border bg-app-surface pl-1 pr-1 shadow-app-sm';
const CURRENT_CLASS = 'border-app-primary bg-app-primary-muted';

/**
 * Строка песни в сете. В editable-режиме перетаскивается **целиком**, а не за ручку:
 * вариант с `dragListener={false}` + `dragControls.start` на кнопке-ручке не заводился
 * на тач-устройствах — кнопка перехватывала pointer-цепочку, а `touch-action: none` стоял
 * только на самой ручке, так что вертикальный скролл забирал жест раньше старта drag'а.
 * `GripVertical` остаётся визуальным аффордансом. Тап по названию открывает песню:
 * порог сдвига у Framer Motion разводит клик и перетаскивание, а после реального drag'а
 * click не эмитится.
 */
export const SetlistItemRow: React.FC<SetlistItemRowProps> = ({
  song,
  index,
  editable,
  onOpen,
  onRemove,
  current = false,
}) => {
  const rowClass = current ? `${ROW_CLASS} ${CURRENT_CLASS}` : ROW_CLASS;
  /**
   * Framer Motion гасит click после drag'а только на самом draggable-элементе, а тут
   * обработчик висит на ВЛОЖЕННОЙ кнопке названия — без этого флага перетаскивание строки
   * заканчивалось переходом на страницу песни (реальный баг, пойман в браузере).
   */
  const draggedRef = useRef(false);

  const handleOpen = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      console.debug('[SetlistItemRow] click после drag подавлен');
      return;
    }
    onOpen?.();
  };

  const content = (
    <>
      {editable && (
        <span aria-hidden className="shrink-0 cursor-grab p-1 text-app-text-muted active:cursor-grabbing">
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
          onClick={onRemove}
          className="shrink-0 rounded-app-sm p-2.5 text-app-text-secondary transition-transform active:scale-90"
        >
          <X size={18} />
        </button>
      )}
    </>
  );

  if (!editable) {
    return (
      <li data-setlist-builder-item aria-current={current ? 'true' : undefined} className={rowClass}>
        {content}
      </li>
    );
  }

  return (
    <Reorder.Item
      value={song}
      aria-current={current ? 'true' : undefined}
      // touch-none на САМОЙ строке (не только на ручке) — иначе скролл контейнера
      // забирает вертикальный жест и drag никогда не стартует на телефоне.
      className={`${rowClass} touch-none select-none`}
      data-setlist-builder-item
      whileDrag={{ scale: 1.02, zIndex: 1 }}
      dragElastic={0.1}
      // Флаг ставим на старте drag'а и снимаем на следующем нажатии: click прилетает
      // ПОСЛЕ dragEnd, поэтому сбрасывать его в onDragEnd было бы слишком рано.
      onPointerDown={() => {
        draggedRef.current = false;
      }}
      onDragStart={() => {
        draggedRef.current = true;
      }}
    >
      {content}
    </Reorder.Item>
  );
};

export default SetlistItemRow;
