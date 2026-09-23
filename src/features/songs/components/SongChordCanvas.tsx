'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { cn } from '@/shared/utils/cn';
import {
  nearestCaretPoint,
  resolveChipOverlaps,
  rubberBand,
  springFrames,
  type CaretPoint,
} from '../lib/chordCanvasLayout';
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
  /** Аккорд перетащили вдоль строки на позицию `pos`. */
  onMoveChord: (ref: ChordRef, pos: number) => void;
}

/** Высота аккорда над глифом: чип (20px) вплотную к верху буквы. */
const CHIP_H = 20;
/** Порог, за которым касание аккорда — уже перетаскивание, а не тап. */
const DRAG_THRESHOLD_PX = 8;
/** Окно, по которому считается скорость отпускания. */
const VELOCITY_WINDOW_MS = 80;

const CHIP_CLASS =
  'rounded px-1 text-[13px] font-bold leading-5 whitespace-nowrap transition-colors';
const chipTone = (selected: boolean) =>
  selected ? 'bg-app-primary text-app-text-inverse' : 'text-app-primary';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

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

/** Скорость по последним сэмплам; палец, замерший перед отпусканием, даёт 0. */
function releaseVelocity(samples: Array<{ x: number; t: number }>, now: number): number {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > VELOCITY_WINDOW_MS) return 0;
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0;
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
  onMoveChord: (ref: ChordRef, pos: number) => void;
}

interface Gesture {
  chip: number;
  pointerId: number;
  startX: number;
  startY: number;
  /** Где палец взял аккорд относительно его левого края — чтобы аккорд не прыгал под палец. */
  grabX: number;
  active: boolean;
  samples: Array<{ x: number; t: number }>;
}

interface DragState {
  chip: number;
  left: number;
  top: number;
  snap: CaretPoint;
}

interface Landing {
  /** Индекс аккорда после правки; `null` — аккорд, выбранный редактором после переноса. */
  chip: number | null;
  fromLeft: number;
  fromTop: number;
  velocity: number;
}

/**
 * Строка со словами. Аккорд — абсолютный слой НАД строкой, а не инлайн-элемент:
 * инлайн-аккорд переливал бы текст при каждой правке (UX-модель плана M9). Большой
 * интерлиньяж оставляет место под аккорды над КАЖДЫМ визуальным рядом переноса.
 *
 * Перетаскивание (T3c): Pointer Events + `setPointerCapture` + `touch-action: none`
 * на самом аккорде. Без `none` Chrome на Android забирает горизонтальный жест себе и
 * присылает `pointercancel` — та же история, что у `SwipePager` и `usePullToRefresh`;
 * гейт — `e2e/gestures/chord-drag.spec.ts`. Аккорд заперт в своей строке: цель —
 * ближайшая к точке отпускания граница символа, без проекции импульса; скорость
 * уходит только в пружину посадки.
 */
const LyricRow = memo(
  function LyricRow({ index, line, cursorPos, selectedIndex, onPlaceCursor, onSelectChord, onMoveChord }: LyricRowProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [points, setPoints] = useState<CaretPoint[] | null>(null);
    // Левые края аккордов вместе со строкой, для которой они посчитаны: посадка ждёт,
    // пока строка после правки перемерится, иначе пружина считалась бы от старых мест.
    const [layout, setLayout] = useState<{ line: LyricLine; lefts: number[] } | null>(null);
    const [layoutVersion, setLayoutVersion] = useState(0);
    const [drag, setDrag] = useState<DragState | null>(null);
    const [landingTick, setLandingTick] = useState(0);
    const gesture = useRef<Gesture | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const landing = useRef<Landing | null>(null);
    const suppressClick = useRef(false);

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
      setLayout({ line, lefts: resolveChipOverlaps(boxes) });
    }, [line, layoutVersion]);

    // Посадка: аккорд уже стоит на новом месте, пружина ведёт его туда из точки отпускания.
    useLayoutEffect(() => {
      const pending = landing.current;
      if (!pending || !points || layout?.line !== line) return;
      const chip = pending.chip ?? selectedIndex;
      const el = chip === null ? null : chipRefs.current[chip];
      landing.current = null;
      if (chip === null || !el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
      const home = points[Math.min(line.chords[chip].pos, points.length - 1)];
      const xs = springFrames(pending.fromLeft - layout.lefts[chip], pending.velocity);
      const ys = springFrames(pending.fromTop - (home.top - CHIP_H), 0);
      const count = Math.max(xs.length, ys.length);
      const frames = Array.from({ length: count }, (_, k) => ({
        transform: `translate(${xs[Math.min(k, xs.length - 1)]}px, ${ys[Math.min(k, ys.length - 1)]}px)`,
      }));
      el.animate(frames, { duration: (count * 1000) / 60, easing: 'linear' });
    }, [landingTick, layout, points, line, selectedIndex]);

    const localPoint = (event: { clientX: number; clientY: number }) => {
      const base = containerRef.current?.getBoundingClientRect();
      return base ? { x: event.clientX - base.left, y: event.clientY - base.top } : null;
    };

    const handleTap = (event: MouseEvent) => {
      const p = localPoint(event);
      if (!p || !points) return;
      const point = nearestCaretPoint(points, p.x, p.y);
      if (point) onPlaceCursor(index, point.pos);
    };

    const handleChipPointerDown = (event: PointerEvent<HTMLButtonElement>, chip: number) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const p = localPoint(event);
      if (!p) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        chip,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        grabX: p.x - (layout?.lefts[chip] ?? 0),
        active: false,
        samples: [{ x: event.clientX, t: event.timeStamp }],
      };
    };

    const handleChipPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId || !points) return;
      if (!g.active) {
        if (Math.hypot(event.clientX - g.startX, event.clientY - g.startY) < DRAG_THRESHOLD_PX) return;
        g.active = true;
        console.debug(`[SongChordCanvas] drag start line=${index} chip=${g.chip}`);
      }
      g.samples.push({ x: event.clientX, t: event.timeStamp });
      if (g.samples.length > 8) g.samples.shift();

      const p = localPoint(event);
      if (!p) return;
      const rawLeft = p.x - g.grabX;
      // Палец держит аккорд над буквами: ряд цели ищем на уровне глифов, на CHIP_H ниже.
      const snap = nearestCaretPoint(points, rawLeft, p.y + CHIP_H);
      if (!snap) return;
      const row = points.filter((pt) => Math.abs(pt.top - snap.top) <= 2);
      const width = containerRef.current?.clientWidth ?? 0;
      const next: DragState = {
        chip: g.chip,
        left: rubberBand(rawLeft, row[0].x, row[row.length - 1].x, width),
        top: snap.top - CHIP_H,
        snap,
      };
      dragRef.current = next;
      setDrag(next);
    };

    const finishDrag = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      gesture.current = null;
      const last = dragRef.current;
      dragRef.current = null;
      if (!g.active || !last) return;

      // Отпускание аккорда — это не тап: следующий за ним click не должен переключать выбор.
      suppressClick.current = true;
      setDrag(null);
      const from = line.chords[g.chip].pos;
      const moved = commit && last.snap.pos !== from;
      landing.current = {
        chip: moved ? null : g.chip,
        fromLeft: last.left,
        fromTop: last.top,
        velocity: commit ? releaseVelocity(g.samples, event.timeStamp) : 0,
      };
      setLandingTick((t) => t + 1);
      console.debug(`[SongChordCanvas] drag end line=${index} ${from}→${last.snap.pos} ${moved ? 'moved' : commit ? 'same place' : 'cancelled'}`);
      if (moved) onMoveChord({ line: index, index: g.chip }, last.snap.pos);
      else if (commit && selectedIndex !== g.chip) onSelectChord({ line: index, index: g.chip });
    };

    const handleChipClick = (chip: number) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      onSelectChord({ line: index, index: chip });
    };

    const caret = cursorPos !== null && points ? points[Math.min(cursorPos, points.length - 1)] : null;

    return (
      <div ref={containerRef} data-song-chord-canvas-line={index} data-song-chord-canvas-lyric-line className="relative">
        <span
          ref={textRef}
          onClick={handleTap}
          className="block cursor-text whitespace-pre-wrap break-words text-[17px] leading-[3.4] text-app-text"
        >
          {line.text}
        </span>
        {line.chords.map((chord, i) => {
          const point = points?.[Math.min(chord.pos, points.length - 1)];
          const dragging = drag?.chip === i;
          return (
            <button
              key={`${i}-${chord.pos}`}
              ref={(el) => {
                chipRefs.current[i] = el;
              }}
              type="button"
              data-song-chord-canvas-chip
              aria-pressed={selectedIndex === i}
              onClick={() => handleChipClick(i)}
              onPointerDown={(e) => handleChipPointerDown(e, i)}
              onPointerMove={handleChipPointerMove}
              onPointerUp={(e) => finishDrag(e, true)}
              onPointerCancel={(e) => finishDrag(e, false)}
              style={{
                left: dragging ? drag.left : (layout?.lefts[i] ?? point?.x ?? 0),
                top: dragging ? drag.top : point ? point.top - CHIP_H : 0,
                visibility: point ? 'visible' : 'hidden',
                // Инлайном, не классом: неслоёное правило globals.css перебивает `touch-*` на кнопках.
                touchAction: 'none',
              }}
              className={cn(
                CHIP_CLASS,
                'absolute cursor-grab',
                dragging ? 'z-10 cursor-grabbing bg-app-primary text-app-text-inverse shadow-app-md' : chipTone(selectedIndex === i)
              )}
            >
              {chord.chord}
            </button>
          );
        })}
        {drag && (
          <span
            aria-hidden
            data-song-chord-canvas-guide
            className="pointer-events-none absolute w-px bg-app-primary"
            style={{ left: drag.snap.x, top: drag.snap.top, height: drag.snap.height }}
          />
        )}
        {caret && !drag && (
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
    a.onSelectChord === b.onSelectChord &&
    a.onMoveChord === b.onMoveChord
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
 * Холст «Аккорды» (M9): тап по слову ставит курсор, тап по аккорду выбирает его,
 * перетаскивание двигает аккорд вдоль строки. Сам холст ничего не меняет — все правки
 * идут через колбэки в редактор, который хранит ChordPro.
 */
export function SongChordCanvas({ lines, cursor, selected, onPlaceCursor, onSelectChord, onMoveChord }: SongChordCanvasProps) {
  // Стабильные колбэки — иначе memo строк сбрасывался бы на каждом рендере редактора.
  const placeRef = useRef(onPlaceCursor);
  const selectRef = useRef(onSelectChord);
  const moveRef = useRef(onMoveChord);
  useEffect(() => {
    placeRef.current = onPlaceCursor;
    selectRef.current = onSelectChord;
    moveRef.current = onMoveChord;
  });
  const place = useCallback((line: number, pos: number) => placeRef.current(line, pos), []);
  const select = useCallback((ref: ChordRef) => selectRef.current(ref), []);
  const move = useCallback((ref: ChordRef, pos: number) => moveRef.current(ref, pos), []);

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
          onMoveChord: move,
        };
        return isChordOnlyLine(line) ? <ChordOnlyRow key={index} {...props} /> : <LyricRow key={index} {...props} />;
      })}
    </div>
  );
}
