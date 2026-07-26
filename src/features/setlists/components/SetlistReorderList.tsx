'use client';

import { Reorder } from 'motion/react';
import { SetlistItemRow } from './SetlistItemRow';

/** Минимум, который нужен строке порядка. `id` — id ПЕСНИ, не строки сета. */
export interface ReorderableSong {
  id: number;
  title: string;
  subtitle?: string;
  songKey?: string;
}

interface SetlistReorderListProps {
  /**
   * Объекты должны быть referentially stable между рендерами (мемоизируй у вызывающего):
   * Framer Motion `Reorder` сопоставляет элементы по идентичности `value`, и новый массив
   * новых объектов на каждый рендер ломает перетаскивание молча — строка просто не едет.
   */
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
}

/** Список песен сета: с drag-reorder и удалением (`editable`) или простой (`li`). */
export const SetlistReorderList: React.FC<SetlistReorderListProps> = ({
  items,
  editable = true,
  onReorder,
  onRemove,
  onOpen,
  currentSongId,
}) => {
  if (items.length === 0) return null;

  const rows = items.map((song, i) => (
    <SetlistItemRow
      key={song.id}
      song={song}
      index={i}
      editable={editable}
      current={song.id === currentSongId}
      onOpen={onOpen ? () => onOpen(song.id) : undefined}
      onRemove={onRemove ? () => onRemove(song.id) : undefined}
    />
  ));

  if (!editable) {
    return (
      <ul data-setlist-view-items className="flex flex-col gap-2">
        {rows}
      </ul>
    );
  }

  return (
    <Reorder.Group
      as="ul"
      axis="y"
      values={items}
      onReorder={(next) => onReorder?.(next.map((song) => song.id))}
      data-setlist-builder-reorder-list
      className="flex flex-col gap-2"
    >
      {rows}
    </Reorder.Group>
  );
};

export default SetlistReorderList;
