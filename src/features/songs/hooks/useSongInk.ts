'use client';

/**
 * Состояние режима рукописных пометок (M10, §6/§7): набор штрихов, черновик текущего
 * штриха, выбранный инструмент, undo и выход с сохранением.
 *
 * Персист сюда НЕ входит — хук получает `initialStrokes` и отдаёт `onSave`.
 * Так состояние тестируется без IndexedDB и без сети.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SongInkTool, SongStroke } from '../types';
import {
  anchorKey,
  nearestLine,
  toAbsolute,
  toAnchored,
  type LayerPoint,
  type LineRect,
} from '../lib/inkGeometry';
import { ERASER_TOLERANCE } from '../lib/inkStroke';
import { hitTestStroke } from '../lib/inkGeometry';
import { INK_COLOR_THEME, INK_WIDTH_RANGE, type InkToolChoice } from '../lib/inkTools';

/** Пауза бездействия, после которой instant annotation сохраняет и выходит (§7). */
export const INSTANT_ANNOTATION_IDLE_MS = 4000;

/** Черновик: точки в координатах слоя, якорь ещё не выбран. */
export interface InkDraft {
  tool: SongInkTool;
  color: string;
  width: number;
  points: LayerPoint[];
}

export interface UseSongInkOptions {
  /** Пометки, прочитанные из стора. Смена ссылки = загрузилась другая песня. */
  initialStrokes: SongStroke[];
  /** Сохранение при выходе/автосохранении. Вызывается только когда есть что писать. */
  onSave: (strokes: SongStroke[]) => void;
  /** Instant annotation: пауза сама сохраняет и выходит из режима. */
  instantAnnotation?: boolean;
  /**
   * Побочные эффекты входа в режим со стороны экрана (пауза автоскролла). Живёт здесь,
   * а не в обработчике кнопки: instant annotation входит в режим мимо неё.
   */
  onEnter?: () => void;
}

let strokeCounter = 0;

/** Локальный id штриха. Глобальной уникальности не требуется — ключ живёт внутри песни. */
function nextStrokeId(): string {
  strokeCounter += 1;
  return `s${Date.now().toString(36)}${strokeCounter.toString(36)}`;
}

/**
 * Глубокая копия набора штрихов.
 *
 * `strokes.slice()` копирует только массив, а объекты в нём остаются те же — поворот,
 * перетаскивание и правка текста меняли бы заодно и «старое» состояние в undo-стеке,
 * и откат визуально ничего не делал. Для штрихов это не всплывало (они только
 * добавляются и удаляются целиком) и вылезло ровно на редактируемых заметках.
 */
export function cloneStrokes(strokes: SongStroke[]): SongStroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    anchor: { ...stroke.anchor },
    points: stroke.points.map((point) => [...point] as [number, number, number]),
  }));
}

export function useSongInk({ initialStrokes, onSave, instantAnnotation = false, onEnter }: UseSongInkOptions) {
  const [active, setActive] = useState(false);
  const [tool, setToolState] = useState<InkToolChoice>('pen');
  const [color, setColor] = useState<string>(INK_COLOR_THEME);
  const [widths, setWidths] = useState<Record<SongInkTool, number>>(() => ({
    pen: INK_WIDTH_RANGE.pen.default,
    highlighter: INK_WIDTH_RANGE.highlighter.default,
    arrow: INK_WIDTH_RANGE.arrow.default,
    text: INK_WIDTH_RANGE.text.default,
  }));
  const [strokes, setStrokes] = useState<SongStroke[]>(() => cloneStrokes(initialStrokes));
  const [draft, setDraft] = useState<InkDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<SongStroke[][]>([]);
  const [dirty, setDirty] = useState(false);

  // Загрузилась другая песня (или подъехали сохранённые пометки) — начинаем заново.
  // Правки при этом не теряются: пока `dirty`, внешние данные не перетирают набор.
  const dirtyRef = useRef(dirty);
  const strokesRef = useRef(strokes);
  const draftRef = useRef<InkDraft | null>(draft);
  const undoStackRef = useRef(undoStack);
  const onSaveRef = useRef(onSave);
  const onEnterRef = useRef(onEnter);
  // Ref-зеркало актуальных значений: запись в ref во время рендера запрещена
  // (React Compiler), а обработчики жестов обязаны видеть свежее состояние.
  useEffect(() => {
    dirtyRef.current = dirty;
    strokesRef.current = strokes;
    draftRef.current = draft;
    undoStackRef.current = undoStack;
    onSaveRef.current = onSave;
    onEnterRef.current = onEnter;
  });

  // Синхронизация с пропом — в рендер-фазе (официальный паттерн «adjusting state when
  // props change»), а не эффектом: setState внутри эффекта даёт каскадный ререндер.
  const [seenInitial, setSeenInitial] = useState(initialStrokes);
  if (seenInitial !== initialStrokes) {
    setSeenInitial(initialStrokes);
    // Пока есть несохранённые правки, внешние данные их не перетирают.
    if (!dirty) {
      setStrokes(cloneStrokes(initialStrokes));
      setUndoStack([]);
      setSelectedId(null);
    }
  }

  const activeWidth = tool === 'eraser' ? widths.pen : widths[tool];

  /** Снимок перед мутацией. Один вызов на действие — иначе undo откатывает по половине. */
  const pushUndo = useCallback(() => {
    setUndoStack((stack) => [...stack.slice(-49), cloneStrokes(strokesRef.current)]);
    setDirty(true);
  }, []);

  const setTool = useCallback((next: InkToolChoice) => {
    setToolState(next);
    // Выделение заметки живёт только внутри текстового инструмента: иначе заметки
    // перехватывали бы штрихи пера и попадания ластика.
    if (next !== 'text') setSelectedId(null);
  }, []);

  const setWidth = useCallback(
    (value: number) => {
      const target: SongInkTool = tool === 'eraser' ? 'pen' : tool;
      const range = INK_WIDTH_RANGE[target];
      setWidths((prev) => ({ ...prev, [target]: Math.min(range.max, Math.max(range.min, value)) }));
    },
    [tool]
  );

  // ---- Черновик штриха -------------------------------------------------------

  const beginDraft = useCallback(
    (point: LayerPoint) => {
      if (tool === 'eraser' || tool === 'text') return;
      setDraft({ tool, color, width: widths[tool], points: [point] });
    },
    [tool, color, widths]
  );

  const extendDraft = useCallback((point: LayerPoint) => {
    setDraft((prev) => {
      if (!prev) return prev;
      // У стрелки ровно две точки: остриё ТЯНЕТСЯ за пальцем, а не копит след.
      if (prev.tool === 'arrow') return { ...prev, points: [prev.points[0], point] };
      return { ...prev, points: [...prev.points, point] };
    });
  }, []);

  const cancelDraft = useCallback(() => setDraft(null), []);

  /**
   * Завершение штриха: выбираем строку-якорь по ПЕРВОЙ точке и переводим геометрию
   * в её координаты. Вырожденные штрихи (тап без протяжки у стрелки, отсутствие
   * якорных строк) не создают запись — иначе на листе копятся невидимые пометки.
   */
  const commitDraft = useCallback(
    (rects: LineRect[]) => {
      const current = draftRef.current;
      setDraft(null);
      if (!current) return;
      if (current.tool === 'arrow' && current.points.length < 2) return;

      const anchorRect = nearestLine(current.points[0], rects);
      if (!anchorRect) {
        console.debug('[useSongInk] commit skipped: нет якорных строк');
        return;
      }

      const stroke: SongStroke = {
        id: nextStrokeId(),
        tool: current.tool,
        anchor: { section: anchorRect.section, line: anchorRect.line },
        points: current.points.map((point) => toAnchored(point, anchorRect)),
        color: current.color,
        width: current.width,
      };
      pushUndo();
      setStrokes((prev) => [...prev, stroke]);
      console.debug('[useSongInk] stroke committed', { tool: stroke.tool, anchor: stroke.anchor });
    },
    [pushUndo]
  );

  // ---- Ластик и точечные правки ---------------------------------------------

  /**
   * Стирание: удаляем ШТРИХ ЦЕЛИКОМ по hit-test'у, а не пиксели. Дешевле и
   * предсказуемее частичной резки геометрии — решение зафиксировано в спеке §6.
   * true — что-то стёрли (вызывающий перерисовывает слой).
   */
  const eraseAt = useCallback(
    (point: LayerPoint, rects: Map<string, LineRect>): boolean => {
      const victim = [...strokesRef.current].reverse().find((stroke) => {
        const absolute = toAbsolute(stroke, rects);
        if (!absolute) return false;
        // У заметки нет геометрии штриха — ловим по её точке привязки.
        const width = stroke.tool === 'text' ? stroke.width * 2 : stroke.width;
        return hitTestStroke(absolute, width, point, ERASER_TOLERANCE);
      });
      if (!victim) return false;
      pushUndo();
      setStrokes((prev) => prev.filter((stroke) => stroke.id !== victim.id));
      return true;
    },
    [pushUndo]
  );

  /** Новая текстовая заметка в точке. Пустой текст записи не создаёт. */
  const addTextNote = useCallback(
    (point: LayerPoint, rects: LineRect[], text: string, vertical = false): void => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const anchorRect = nearestLine(point, rects);
      if (!anchorRect) return;
      const stroke: SongStroke = {
        id: nextStrokeId(),
        tool: 'text',
        anchor: { section: anchorRect.section, line: anchorRect.line },
        points: [toAnchored(point, anchorRect)],
        color,
        width: widths.text,
        text: trimmed,
        ...(vertical ? { vertical: true } : null),
      };
      pushUndo();
      setStrokes((prev) => [...prev, stroke]);
    },
    [color, widths.text, pushUndo]
  );

  /**
   * Правка существующего штриха (перетаскивание, поворот, текст) — всё через undo-стек.
   * `reanchor` даёт перепривязку к новой строке: заметка, утащенная к другому куплету,
   * иначе продолжит ездить за исходной строкой при смене шрифта.
   */
  const updateStroke = useCallback(
    (id: string, patch: Partial<Omit<SongStroke, 'id'>>): void => {
      pushUndo();
      setStrokes((prev) => prev.map((stroke) => (stroke.id === id ? { ...stroke, ...patch } : stroke)));
    },
    [pushUndo]
  );

  /** Перенос заметки в новую точку слоя с перепривязкой к ближайшей строке. */
  const moveStroke = useCallback(
    (id: string, point: LayerPoint, rects: LineRect[]): void => {
      const anchorRect = nearestLine(point, rects);
      if (!anchorRect) return;
      updateStroke(id, {
        anchor: { section: anchorRect.section, line: anchorRect.line },
        points: [toAnchored(point, anchorRect)],
      });
    },
    [updateStroke]
  );

  const removeStroke = useCallback(
    (id: string): void => {
      pushUndo();
      setStrokes((prev) => prev.filter((stroke) => stroke.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [pushUndo]
  );

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    setStrokes(stack[stack.length - 1]);
    setUndoStack(stack.slice(0, -1));
    setSelectedId(null);
  }, []);

  const clearAll = useCallback(() => {
    pushUndo();
    setStrokes([]);
    setSelectedId(null);
  }, [pushUndo]);

  // ---- Вход/выход ------------------------------------------------------------

  const enter = useCallback(() => {
    setActive(true);
    setDraft(null);
    onEnterRef.current?.();
    console.debug('[useSongInk] draw mode on');
  }, []);

  /** Выход. `save` — записать правки; иначе откат к последнему сохранённому состоянию. */
  const exit = useCallback(
    (save: boolean) => {
      setDraft(null);
      setSelectedId(null);
      if (save && dirtyRef.current) {
        onSaveRef.current(cloneStrokes(strokesRef.current));
      } else if (!save) {
        setStrokes(cloneStrokes(initialStrokes));
      }
      setUndoStack([]);
      setDirty(false);
      setActive(false);
      console.debug('[useSongInk] draw mode off', { saved: save });
    },
    [initialStrokes]
  );

  // ---- Instant annotation ----------------------------------------------------

  const [activityTick, setActivityTick] = useState(0);
  /** Сбрасывает таймер бездействия. Обязателен во время набора текста — иначе режим
   *  закроется прямо посреди ввода. */
  const noteActivity = useCallback(() => setActivityTick((n) => n + 1), []);

  const exitRef = useRef(exit);
  useEffect(() => {
    exitRef.current = exit;
  });
  useEffect(() => {
    if (!active || !instantAnnotation) return;
    const timer = setTimeout(() => {
      console.debug('[useSongInk] instant annotation idle → save & exit');
      exitRef.current(true);
    }, INSTANT_ANNOTATION_IDLE_MS);
    return () => clearTimeout(timer);
  }, [active, instantAnnotation, activityTick, strokes, draft]);

  const strokeIndex = useMemo(() => new Set(strokes.map((s) => anchorKey(s.anchor.section, s.anchor.line))), [strokes]);

  return {
    active,
    tool,
    color,
    width: activeWidth,
    strokes,
    draft,
    selectedId,
    dirty,
    canUndo: undoStack.length > 0,
    /** Множество занятых якорей — для диагностики и тестов. */
    strokeIndex,
    enter,
    exit,
    setTool,
    setColor,
    setWidth,
    setSelectedId,
    beginDraft,
    extendDraft,
    commitDraft,
    cancelDraft,
    eraseAt,
    addTextNote,
    updateStroke,
    moveStroke,
    removeStroke,
    undo,
    clearAll,
    noteActivity,
  };
}

export type SongInkSession = ReturnType<typeof useSongInk>;
