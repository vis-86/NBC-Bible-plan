'use client';

/**
 * Слой рукописных пометок поверх листа песни (M10, §6).
 *
 * Компонент ОБОРАЧИВАЕТ поток песни, а не встаёт рядом: canvas обязан лежать в
 * позиционированном контейнере, который не является multicol-элементом (внутри
 * `columns` абсолютный потомок фрагментируется по колонкам).
 *
 * Черновик рисуется на том же canvas, отдельного слоя нет: песен 97, штрихов единицы —
 * перерисовать всё за кадр дешевле, чем поддерживать два холста.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import {
  collectLineRects,
  indexLineRects,
  toAbsolute,
  type LayerPoint,
  type LineRect,
} from '../lib/inkGeometry';
import { drawStroke } from '../lib/inkStroke';
import { INK_COLOR_THEME, resolveInkColor } from '../lib/inkTools';
import { useInkInput, type InkGesture } from '../hooks/useInkInput';
import type { SongInkSession } from '../hooks/useSongInk';
import { SongInkTextNote } from './SongInkTextNote';

export interface SongInkLayerProps {
  ink: SongInkSession;
  /** «Только стилус»: палец скроллит и зумит даже внутри режима рисования. */
  penOnly: boolean;
  /**
   * Instant annotation: касание ПЕРОМ вне режима включает режим и рисует тем же
   * жестом. Ввод для этого остаётся навешенным и вне режима — иначе первое касание
   * терялось бы: обработчик, навешенный по факту включения, приходит на кадр позже.
   */
  instantAnnotation?: boolean;
  /**
   * Ключ раскладки: смена размера шрифта, колонок, плотности, транспозиции. Меняется ⇒
   * строки переехали ⇒ bounding box'ы надо пересобрать.
   */
  layoutSignature: string;
  /** Двухпальцевый жест уходит наверх — прокруткой и зумом владеет страница. */
  onGesture?: (gesture: InkGesture) => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Селектор собственного UI слоя — его события ввод обязан пропускать мимо. */
const INK_UI_SELECTOR = '[data-song-ink-ui]';

export function SongInkLayer({
  ink,
  penOnly,
  instantAnnotation = false,
  layoutSignature,
  onGesture,
  className,
  style,
  children,
}: SongInkLayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rects, setRects] = useState<LineRect[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  /**
   * Цвет «чернил по теме», снятый с CSS-переменной при измерении. Держим в state,
   * а не читаем из DOM в рендере: обращение к ref во время рендера запрещено, и
   * заметки иначе не перекрашивались бы при смене темы.
   */
  const [themeInk, setThemeInk] = useState('#111827');
  /** Открытое поле ввода заметки: новая (`strokeId: null`) либо правка существующей. */
  const [editor, setEditor] = useState<{ x: number; y: number; strokeId: string | null; text: string } | null>(null);

  const rectIndex = useMemo(() => indexLineRects(rects), [rects]);
  const rectsRef = useRef(rects);
  const rectIndexRef = useRef(rectIndex);
  useEffect(() => {
    rectsRef.current = rects;
    rectIndexRef.current = rectIndex;
  });

  /** Текущий масштаб слоя (зум страницы) — нужен и измерению, и переводу координат. */
  const currentScale = useCallback((): number => {
    const el = hostRef.current;
    if (!el || el.offsetWidth === 0) return 1;
    return el.getBoundingClientRect().width / el.offsetWidth || 1;
  }, []);

  const toLayer = useCallback(
    (clientX: number, clientY: number) => {
      const el = hostRef.current;
      if (!el) return { x: 0, y: 0 };
      const box = el.getBoundingClientRect();
      const scale = currentScale();
      return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale };
    },
    [currentScale]
  );

  // ---- Измерение строк и размера слоя ---------------------------------------

  const measure = useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const scale = currentScale();
    setSize({ width: el.offsetWidth, height: el.offsetHeight });
    setThemeInk(resolveInkColor(INK_COLOR_THEME, el));
    setRects(collectLineRects(el, { left: box.left, top: box.top }, scale));
  }, [currentScale]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  // Смена шрифта/колонок/транспозиции двигает строки без изменения размера слоя —
  // ResizeObserver такого не ловит, поэтому пересчёт ещё и по подписи раскладки.
  useEffect(() => {
    measure();
  }, [layoutSignature, measure]);

  useEffect(() => {
    console.debug('[SongInkLayer] measured', { lines: rects.length, size, strokes: ink.strokes.length });
  }, [rects.length, size, ink.strokes.length]);

  // ---- Отрисовка -------------------------------------------------------------

  const strokes = ink.strokes;
  const draft = ink.draft;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host || size.width === 0 || size.height === 0) return;

    // Рендер батчится кадром: pointermove приходит десятками в секунду, и синхронная
    // перерисовка на каждое событие роняет частоту кадров на слабом планшете.
    const frame = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(size.width * dpr) || canvas.height !== Math.round(size.height * dpr)) {
        canvas.width = Math.round(size.width * dpr);
        canvas.height = Math.round(size.height * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);

      for (const stroke of strokes) {
        if (stroke.tool === 'text') continue; // заметки живут в DOM-слое
        const points = toAbsolute(stroke, rectIndex);
        // Строки-якоря сейчас нет (другая раскладка, песню перерисовали) — штрих
        // просто не рисуется. Падать здесь нельзя: сломается весь лист.
        if (!points) continue;
        drawStroke(ctx, { ...stroke, color: resolveInkColor(stroke.color, host) }, points);
      }

      if (draft && draft.points.length > 0) {
        drawStroke(
          ctx,
          { tool: draft.tool, color: resolveInkColor(draft.color, host), width: draft.width },
          draft.points.map((p) => [p.x, p.y, p.pressure] as [number, number, number])
        );
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [strokes, draft, rectIndex, size]);

  // ---- Поле ввода заметки ----------------------------------------------------

  /**
   * Явный коммит вместо единственного `blur`: на iOS фокус встаёт не всегда, и
   * набранный текст пропадал молча. Защита от двойного вызова — по факту закрытия поля.
   */
  /** Идёт коммит — защита от повторного вызова (`blur` от размонтирования поля). */
  const committingRef = useRef(false);

  const commitEditor = useCallback(() => {
    const current = editor;
    if (!current || committingRef.current) return;
    committingRef.current = true;
    setEditor(null);

    const text = current.text.trim();
    if (current.strokeId) {
      // Пустой текст = удаление: иначе на листе остаётся пустая рамка.
      if (text) ink.updateStroke(current.strokeId, { text });
      else ink.removeStroke(current.strokeId);
    } else if (text) {
      ink.addTextNote({ x: current.x, y: current.y, pressure: 0.5 }, rectsRef.current, text);
    }
    committingRef.current = false;
  }, [ink, editor]);

  const startEdit = useCallback(
    (strokeId: string, x: number, y: number, text: string) => {
      commitEditor();
      setEditor({ x, y, strokeId, text });
    },
    [commitEditor]
  );

  // ---- Ввод ------------------------------------------------------------------

  /** Точка нажатия текстовым инструментом — тап по пустому месту открывает поле ввода. */
  const textTapRef = useRef<LayerPoint | null>(null);

  const handleBegin = useCallback(
    (point: LayerPoint) => {
      ink.noteActivity();
      if (!ink.active) ink.enter();
      if (ink.tool === 'eraser') {
        ink.eraseAt(point, rectIndexRef.current);
        return;
      }
      if (ink.tool === 'text') {
        textTapRef.current = point;
        return;
      }
      ink.beginDraft(point);
    },
    [ink]
  );

  const handleMove = useCallback(
    (point: LayerPoint) => {
      if (ink.tool === 'eraser') {
        ink.eraseAt(point, rectIndexRef.current);
        return;
      }
      if (ink.tool === 'text') return;
      ink.extendDraft(point);
    },
    [ink]
  );

  const handleEnd = useCallback(() => {
    ink.noteActivity();
    if (ink.tool === 'text') {
      const point = textTapRef.current;
      textTapRef.current = null;
      if (point) {
        // Открытое поле сначала коммитим — иначе набранный текст молча пропадёт.
        commitEditor();
        setEditor({ x: point.x, y: point.y, strokeId: null, text: '' });
      }
      return;
    }
    if (ink.tool === 'eraser') return;
    ink.commitDraft(rectsRef.current);
  }, [ink, commitEditor]);

  const handleCancel = useCallback(() => {
    textTapRef.current = null;
    ink.cancelDraft();
  }, [ink]);

  useInkInput({
    targetRef: hostRef,
    enabled: ink.active || instantAnnotation,
    // Вне режима рисует ТОЛЬКО перо: иначе instant annotation превращал бы любой
    // скролл пальцем в штрих.
    penOnly: penOnly || !ink.active,
    onBegin: handleBegin,
    onMove: handleMove,
    onEnd: handleEnd,
    onCancel: handleCancel,
    onGesture,
    ignoreSelector: INK_UI_SELECTOR,
  });

  const textInteractive = ink.active && ink.tool === 'text';

  return (
    <div
      ref={hostRef}
      data-song-ink-host
      data-song-ink-active={ink.active ? '' : undefined}
      className={cn('relative', className)}
      // touch-action: none — иначе браузер съест жест как скролл ещё до pointermove.
      // Снимаем его при «только стилус»: там палец обязан прокручивать штатно.
      style={{ ...style, touchAction: ink.active && !penOnly ? 'none' : undefined }}
    >
      {children}

      <canvas
        ref={canvasRef}
        data-song-ink-canvas
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      <div data-song-ink-notes className="pointer-events-none absolute inset-0">
        {strokes.map((stroke) => {
          if (stroke.tool !== 'text') return null;
          const points = toAbsolute(stroke, rectIndex);
          if (!points) return null;
          return (
            <SongInkTextNote
              key={stroke.id}
              stroke={stroke}
              x={points[0][0]}
              y={points[0][1]}
              color={stroke.color === INK_COLOR_THEME ? themeInk : stroke.color}
              selected={ink.selectedId === stroke.id}
              interactive={textInteractive}
              onSelect={() => ink.setSelectedId(stroke.id)}
              onMove={(point) => ink.moveStroke(stroke.id, { ...point, pressure: 0.5 }, rectsRef.current)}
              onToggleVertical={() => ink.updateStroke(stroke.id, { vertical: !stroke.vertical })}
              onEdit={() => startEdit(stroke.id, points[0][0], points[0][1], stroke.text ?? '')}
              onDelete={() => ink.removeStroke(stroke.id)}
              toLayer={toLayer}
              onActivity={ink.noteActivity}
            />
          );
        })}

        {editor && (
          <input
            data-song-ink-ui
            data-song-ink-text-input
            autoFocus
            value={editor.text}
            placeholder="Заметка"
            aria-label="Текст заметки"
            style={{ left: editor.x, top: editor.y, fontSize: ink.width }}
            className="pointer-events-auto absolute w-40 -translate-x-1/2 -translate-y-1/2 rounded-app-sm border border-app-primary bg-app-surface-elevated px-2 py-1 font-sans text-app-text shadow-app-md outline-none"
            onChange={(e) => {
              ink.noteActivity();
              setEditor((prev) => (prev ? { ...prev, text: e.target.value } : prev));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEditor();
              if (e.key === 'Escape') setEditor(null);
            }}
            onBlur={commitEditor}
          />
        )}
      </div>
    </div>
  );
}
