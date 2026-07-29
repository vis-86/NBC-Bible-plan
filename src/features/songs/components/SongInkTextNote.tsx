'use client';

/**
 * Текстовая заметка (M10, §6). Живёт в DOM, а не на canvas, именно потому, что её надо
 * выделять, двигать, поворачивать и править — на canvas всё это пришлось бы рисовать
 * и хит-тестить руками.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { Pencil, RotateCw, Trash2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { SongStroke } from '../types';

export interface SongInkTextNoteProps {
  stroke: SongStroke;
  /** Позиция в координатах слоя. */
  x: number;
  y: number;
  color: string;
  selected: boolean;
  /** Заметки реагируют на жесты только при активном текстовом инструменте. */
  interactive: boolean;
  onSelect: () => void;
  /** Перетаскивание завершено: новая точка в координатах слоя. */
  onMove: (point: { x: number; y: number }) => void;
  onToggleVertical: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Перевод координат экрана в координаты слоя (учитывает зум). */
  toLayer: (clientX: number, clientY: number) => { x: number; y: number };
  /** Сбрасывает таймер instant annotation. */
  onActivity: () => void;
}

/** Порог, ниже которого движение считается тапом (выделением), а не перетаскиванием. */
const DRAG_THRESHOLD_PX = 4;

export function SongInkTextNote({
  stroke,
  x,
  y,
  color,
  selected,
  interactive,
  onSelect,
  onMove,
  onToggleVertical,
  onEdit,
  onDelete,
  toLayer,
  onActivity,
}: SongInkTextNoteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onSelect, onMove, toLayer, onActivity, interactive });
  useEffect(() => {
    handlers.current = { onSelect, onMove, toLayer, onActivity, interactive };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let dragging = false;
    let moved = false;
    let pointerId: number | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (!handlers.current.interactive) return;
      e.stopPropagation();
      e.preventDefault();
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      handlers.current.onActivity();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Захват — не обязательное условие: без try/catch исключение убивало весь жест.
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return;
      const point = handlers.current.toLayer(e.clientX, e.clientY);
      if (!moved) {
        const start = el.getBoundingClientRect();
        if (Math.hypot(e.clientX - start.left, e.clientY - start.top) < DRAG_THRESHOLD_PX) return;
        moved = true;
      }
      // Тот же якорь, что в разметке: под пальцем едет ЛЕВЫЙ край заметки.
      el.style.transform = `translateY(-50%)`;
      el.style.left = `${point.x}px`;
      el.style.top = `${point.y}px`;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      handlers.current.onActivity();
      if (moved) handlers.current.onMove(handlers.current.toLayer(e.clientX, e.clientY));
      else handlers.current.onSelect();
    };

    el.addEventListener('pointerdown', onPointerDown);
    // Слушаем window, а не сам элемент: слой перерисовывается покадрово, и обработчики
    // на самом элементе умирают вместе с ним после первого же движения (прототип).
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const style: CSSProperties = {
    left: x,
    top: y,
    color,
    fontSize: stroke.width,
    writingMode: stroke.vertical ? 'vertical-rl' : undefined,
  };

  return (
    <>
      <div
        ref={ref}
        data-song-ink-note
        data-song-ink-note-selected={selected ? '' : undefined}
        style={style}
        className={cn(
          // Якорь заметки — её ЛЕВЫЙ край: тапом задают место, откуда текст начинается.
          // Тот же якорь у поля ввода (`SongInkLayer`) — иначе набранное и получившееся
          // стоят в разных местах.
          'absolute -translate-y-1/2 whitespace-pre rounded-app-sm px-1 font-sans leading-tight',
          interactive ? 'pointer-events-auto touch-none cursor-move' : 'pointer-events-none',
          selected && 'outline-2 outline-dashed outline-offset-2 outline-app-primary'
        )}
      >
        {/* Заметку можно таскать — но перетаскивание жест немой: без ручки его никто
            не пробует. Ручка появляется только при активном текстовом инструменте,
            когда заметка действительно ловит указатель. */}
        {interactive && <DragGrip />}
        {stroke.text}
      </div>

      {selected && interactive && (
        // Панель поверх заметки. Разрушающее действие — последним, чтобы промах
        // по соседней кнопке не удалял заметку.
        <div
          data-song-ink-ui
          data-song-ink-note-actions
          style={{ left: x, top: y - stroke.width - 12 }}
          className="pointer-events-auto absolute z-10 flex -translate-y-full items-center gap-0.5 rounded-app-md border border-app-border bg-app-surface-elevated p-1 shadow-app-md"
        >
          <NoteAction label="Повернуть" onClick={onToggleVertical}>
            <RotateCw size={16} />
          </NoteAction>
          <NoteAction label="Изменить текст" onClick={onEdit}>
            <Pencil size={16} />
          </NoteAction>
          <NoteAction label="Удалить заметку" onClick={onDelete} destructive>
            <Trash2 size={16} />
          </NoteAction>
        </div>
      )}
    </>
  );
}

/**
 * Пять точек у левого края заметки — общепринятый значок «меня можно двигать».
 * Рисуем разметкой, а не иконкой: `GripVertical` из lucide даёт шесть точек в два
 * столбца и на мелком кегле заметки читается пятном.
 *
 * Ручка — часть самой заметки, отдельного обработчика у неё нет: жест уже висит на
 * корне заметки, и второй pointer-слушатель тут дал бы две конкурирующие цели.
 *
 * Позиционируется абсолютно ВНЕ потока заметки: в потоке она сдвигала бы текст вправо
 * на свою ширину, и заметка переставала совпадать с полем ввода, из которого её набрали.
 */
function DragGrip() {
  return (
    <span
      data-song-ink-note-grip
      aria-hidden
      className="absolute top-1/2 right-full flex -translate-y-1/2 flex-col items-center gap-[2px] pr-1 opacity-45"
    >
      {[0, 1, 2, 3, 4].map((dot) => (
        <span key={dot} className="h-[2px] w-[2px] rounded-full bg-current" />
      ))}
    </span>
  );
}

function NoteAction({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-app-sm transition-colors active:scale-95',
        destructive ? 'text-app-primary hover:bg-app-missed' : 'text-app-text-secondary hover:bg-app-surface-muted'
      )}
    >
      {children}
    </button>
  );
}
