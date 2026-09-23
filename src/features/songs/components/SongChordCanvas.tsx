'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { cn } from '@/shared/utils/cn';
import { nearestCaretPoint, resolveChipOverlaps, type CaretPoint } from '../lib/chordCanvasLayout';
import { isChordOnlyLine, serializeLyric, type ChordRef, type EditLine, type LyricLine } from '../lib/songEditModel';

export interface ChordCursor {
  line: number;
  pos: number;
}

export interface SongChordCanvasProps {
  lines: EditLine[];
  cursor: ChordCursor | null;
  selected: ChordRef | null;
  onPlaceCursor: (line: number, pos: number) => void;
  onSelectChord: (ref: ChordRef) => void;
}

/** Высота аккорда над глифом: чип (20px) вплотную к верху буквы. */
const CHIP_H = 20;

const CHIP_CLASS =
  'rounded px-1 text-[13px] font-bold leading-5 whitespace-nowrap transition-colors';
const chipTone = (selected: boolean) =>
  selected ? 'bg-app-primary text-app-text-inverse' : 'text-app-primary';

/**
 * Точки вставки перед каждым символом (и после последнего) в координатах строки.
 * Range по одному символу: у переносимой строки у каждого визуального ряда свой `top`.
 */
function measureCaretPoints(node: Text, container: HTMLElement): CaretPoint[] {
  const base = container.getBoundingClientRect();
  const length = node.data.length;
  const range = document.createRange();
  const points: CaretPoint[] = [];
  for (let pos = 0; pos <= length; pos++) {
    const at = Math.min(pos, length - 1);
    range.setStart(node, at);
    range.setEnd(node, at + 1);
    const rect = range.getBoundingClientRect();
    points.push({
      pos,
      x: (pos < length ? rect.left : rect.right) - base.left,
      top: rect.top - base.top,
      height: rect.height,
    });
  }
  return points;
}

interface LyricRowProps {
  index: number;
  line: LyricLine;
  /** Сериализованная строка — ключ мемоизации: `lines` пересобирается на каждой правке. */
  source: string;
  cursorPos: number | null;
  selectedIndex: number | null;
  onPlaceCursor: (line: number, pos: number) => void;
  onSelectChord: (ref: ChordRef) => void;
}

/**
 * Строка со словами. Аккорд — абсолютный слой НАД строкой, а не инлайн-элемент:
 * инлайн-аккорд переливал бы текст при каждой правке (UX-модель плана M9). Большой
 * интерлиньяж оставляет место под аккорды над КАЖДЫМ визуальным рядом переноса.
 */
const LyricRow = memo(
  function LyricRow({ index, line, cursorPos, selectedIndex, onPlaceCursor, onSelectChord }: LyricRowProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [points, setPoints] = useState<CaretPoint[] | null>(null);
    const [lefts, setLefts] = useState<number[]>([]);
    const [layoutVersion, setLayoutVersion] = useState(0);

    // Ширина строки меняется (поворот, клавиатура, шрифт догрузился) — переносы тоже.
    useEffect(() => {
      const container = containerRef.current;
      if (!container || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => setLayoutVersion((v) => v + 1));
      observer.observe(container);
      return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
      const container = containerRef.current;
      const node = textRef.current?.firstChild;
      if (!container || !(node instanceof Text)) return;
      const measured = measureCaretPoints(node, container);
      const boxes = line.chords.map((chord, i) => {
        const point = measured[Math.min(chord.pos, measured.length - 1)];
        return { x: point.x, top: point.top, width: chipRefs.current[i]?.offsetWidth ?? 0 };
      });
      setPoints(measured);
      setLefts(resolveChipOverlaps(boxes));
    }, [line, layoutVersion]);

    const handleTap = (event: MouseEvent) => {
      const container = containerRef.current;
      if (!container || !points) return;
      const base = container.getBoundingClientRect();
      const point = nearestCaretPoint(points, event.clientX - base.left, event.clientY - base.top);
      if (point) onPlaceCursor(index, point.pos);
    };

    const caret = cursorPos !== null && points ? points[Math.min(cursorPos, points.length - 1)] : null;

    return (
      <div ref={containerRef} data-song-chord-canvas-line={index} className="relative">
        <span
          ref={textRef}
          onClick={handleTap}
          className="block cursor-text whitespace-pre-wrap break-words text-[17px] leading-[3.4] text-app-text"
        >
          {line.text}
        </span>
        {line.chords.map((chord, i) => {
          const point = points?.[Math.min(chord.pos, points.length - 1)];
          return (
            <button
              key={`${i}-${chord.pos}`}
              ref={(el) => {
                chipRefs.current[i] = el;
              }}
              type="button"
              data-song-chord-canvas-chip
              aria-pressed={selectedIndex === i}
              onClick={() => onSelectChord({ line: index, index: i })}
              style={{
                left: lefts[i] ?? point?.x ?? 0,
                top: point ? point.top - CHIP_H : 0,
                visibility: point ? 'visible' : 'hidden',
                touchAction: 'manipulation',
              }}
              className={cn(CHIP_CLASS, 'absolute', chipTone(selectedIndex === i))}
            >
              {chord.chord}
            </button>
          );
        })}
        {caret && (
          <span
            aria-hidden
            data-song-chord-canvas-caret
            className="pointer-events-none absolute w-0.5 animate-pulse rounded-full bg-app-primary"
            style={{ left: caret.x - 1, top: caret.top - CHIP_H, height: CHIP_H + caret.height }}
          />
        )}
      </div>
    );
  },
  (a, b) =>
    a.index === b.index &&
    a.source === b.source &&
    a.cursorPos === b.cursorPos &&
    a.selectedIndex === b.selectedIndex &&
    a.onPlaceCursor === b.onPlaceCursor &&
    a.onSelectChord === b.onSelectChord
);

/** Строка без слов (вступление, проигрыш): аккорды цепочкой, новый — в конец по «+». */
function ChordOnlyRow({ index, line, cursorPos, selectedIndex, onPlaceCursor, onSelectChord }: LyricRowProps) {
  const cursorHere = cursorPos !== null;
  return (
    <div data-song-chord-canvas-line={index} className="flex flex-wrap items-center gap-1.5 py-2">
      {line.chords.map((chord, i) => (
        <button
          key={`${i}-${chord.pos}`}
          type="button"
          data-song-chord-canvas-chip
          aria-pressed={selectedIndex === i}
          onClick={() => onSelectChord({ line: index, index: i })}
          style={{ touchAction: 'manipulation' }}
          // В цепочке место есть — даём пальцу полноценную цель: `|` иначе шириной в 8px.
          className={cn(CHIP_CLASS, 'min-h-8 min-w-8', chipTone(selectedIndex === i))}
        >
          {chord.chord}
        </button>
      ))}
      <button
        type="button"
        aria-label="Добавить аккорд в конец строки"
        aria-pressed={cursorHere}
        onClick={() => onPlaceCursor(index, line.text.length)}
        style={{ touchAction: 'manipulation' }}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full border text-sm',
          cursorHere ? 'border-app-primary text-app-primary' : 'border-app-border text-app-text-muted'
        )}
      >
        +
      </button>
    </div>
  );
}

/**
 * Холст «Аккорды» (M9, T3b): тап по слову ставит курсор, тап по аккорду выбирает его.
 * Сам холст ничего не меняет — все правки идут через колбэки в редактор, который
 * хранит ChordPro. Перетаскивание аккорда вдоль строки — следующий шаг (T3c).
 */
export function SongChordCanvas({ lines, cursor, selected, onPlaceCursor, onSelectChord }: SongChordCanvasProps) {
  // Стабильные колбэки — иначе memo строк сбрасывался бы на каждом рендере редактора.
  const placeRef = useRef(onPlaceCursor);
  const selectRef = useRef(onSelectChord);
  useEffect(() => {
    placeRef.current = onPlaceCursor;
    selectRef.current = onSelectChord;
  });
  const place = useCallback((line: number, pos: number) => placeRef.current(line, pos), []);
  const select = useCallback((ref: ChordRef) => selectRef.current(ref), []);

  return (
    <div data-song-chord-canvas className="select-none">
      {lines.map((line, index) => {
        if (line.kind === 'label') {
          return (
            <p key={index} className="mt-5 mb-1 text-[11px] font-semibold uppercase tracking-wide text-app-text-muted first:mt-0">
              {line.label}
            </p>
          );
        }
        if (line.kind === 'raw') {
          return line.source.trim() ? null : <div key={index} className="h-2" aria-hidden />;
        }
        const props: LyricRowProps = {
          index,
          line,
          source: serializeLyric(line),
          cursorPos: cursor?.line === index ? cursor.pos : null,
          selectedIndex: selected?.line === index ? selected.index : null,
          onPlaceCursor: place,
          onSelectChord: select,
        };
        return isChordOnlyLine(line) ? <ChordOnlyRow key={index} {...props} /> : <LyricRow key={index} {...props} />;
      })}
    </div>
  );
}
