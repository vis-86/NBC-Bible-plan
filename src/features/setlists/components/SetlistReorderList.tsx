'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SetlistItemRow } from './SetlistItemRow';

/** Минимум, который нужен строке порядка. `id` — id ПЕСНИ, не строки сета. */
export interface ReorderableSong {
  id: number;
  title: string;
  subtitle?: string;
  songKey?: string;
}

interface SetlistReorderListProps {
  items: ReorderableSong[];
  /** `false` — только чтение: без drag, ручки и крестика (читатель, офлайн). */
  editable?: boolean;
  /** Новый полный порядок id песен. Обязателен при `editable`. */
  onReorder?: (songIds: number[]) => void;
  onRemove?: (songId: number) => void;
  /** Открыть песню. Не задан — строки не кликабельны. */
  onOpen?: (songId: number) => void;
  /** id песни, открытой сейчас в режиме сета — её строка подсвечивается. */
  currentSongId?: number;
  /**
   * Сделать список собственным скролл-контейнером (ограниченная высота).
   * Нужно в шите управления сетом, где список длиннее видимой области; в потоке
   * страницы (builder/confirm), где скроллит вся страница, не нужно. @dnd-kit сам
   * находит скролл-контейнер и автоскроллит его во время перетаскивания.
   */
  scrollable?: boolean;
}

const ROW_CLASS =
  'flex items-center gap-2 rounded-app-md border border-app-border bg-app-surface pl-1 pr-1 shadow-app-sm';
const CURRENT_CLASS = 'border-app-primary bg-app-primary-muted';

/** Массив-константа вне рендера: не пересоздаётся, DndContext не переинициализирует modifiers. */
const DND_MODIFIERS = [restrictToVerticalAxis];

/**
 * Строка в editable-режиме: @dnd-kit `useSortable`. Перетаскивается ЦЕЛИКОМ (listeners
 * на всём `<li>`) — ручка-`⠿` только визуальный аффорданс. `touch-action: none` обязателен,
 * иначе браузер заберёт вертикальный тач под скролл и drag не стартует на телефоне.
 *
 * Без `DragOverlay`: строку двигает её собственный `transform` (относительное
 * позиционирование). Оверлей здесь нельзя — он `position: fixed`, а оболочка дашборда
 * `.h-app-viewport` `transform`-ится и становится для него containing block'ом, из-за
 * чего копия «телепортируется» вниз (та же грабля, что со шторками в CLAUDE.md).
 */
const SortableRow: React.FC<{
  song: ReorderableSong;
  index: number;
  current: boolean;
  onOpen?: () => void;
  onRemove?: () => void;
}> = ({ song, index, current, onOpen, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(song.id),
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
    // Поднимаем взятую строку над соседями (тень — в className).
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? 'relative' : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-setlist-builder-item
      aria-current={current ? 'true' : undefined}
      className={`${current ? `${ROW_CLASS} ${CURRENT_CLASS}` : ROW_CLASS} select-none ${isDragging ? 'shadow-app-lg' : ''}`}
      {...attributes}
      {...listeners}
    >
      <SetlistItemRow
        song={song}
        index={index}
        editable
        isDragging={isDragging}
        onOpen={onOpen}
        onRemove={onRemove}
      />
    </li>
  );
};

/** Список песен сета: drag-reorder на @dnd-kit (`editable`) или простой `<ul>` для чтения. */
export const SetlistReorderList: React.FC<SetlistReorderListProps> = ({
  items,
  editable = true,
  onReorder,
  onRemove,
  onOpen,
  currentSongId,
  scrollable = false,
}) => {
  // Порог 6px разводит тап (открыть песню) и перетаскивание; клавиатурный сенсор — a11y.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (items.length === 0) return null;

  if (!editable) {
    return (
      <ul data-setlist-view-items className="flex flex-col gap-2">
        {items.map((song, i) => (
          <li
            key={song.id}
            data-setlist-builder-item
            aria-current={song.id === currentSongId ? 'true' : undefined}
            className={song.id === currentSongId ? `${ROW_CLASS} ${CURRENT_CLASS}` : ROW_CLASS}
          >
            <SetlistItemRow
              song={song}
              index={i}
              editable={false}
              onOpen={onOpen ? () => onOpen(song.id) : undefined}
            />
          </li>
        ))}
      </ul>
    );
  }

  const ids = items.map((song) => String(song.id));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder?.(arrayMove(items, from, to).map((song) => song.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={DND_MODIFIERS}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul
          data-setlist-builder-reorder-list
          className={
            scrollable
              ? 'flex max-h-[min(60vh,calc(var(--app-vh,100dvh)-16rem))] flex-col gap-2 overflow-y-auto overscroll-contain'
              : 'flex flex-col gap-2'
          }
        >
          {items.map((song, i) => (
            <SortableRow
              key={song.id}
              song={song}
              index={i}
              current={song.id === currentSongId}
              onOpen={onOpen ? () => onOpen(song.id) : undefined}
              onRemove={onRemove ? () => onRemove(song.id) : undefined}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
};

export default SetlistReorderList;
