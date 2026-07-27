'use client';

import { useEffect, useRef } from 'react';
import { resolveSwipeDirection } from '@/shared/hooks/useHorizontalSwipe';

const AXIS_LOCK_PX = 8;
/**
 * Потолок сдвига контента, px. Палец может уехать сколь угодно далеко — страница
 * лишь «подаётся» под него и асимптотически упирается в этот предел: жест читается,
 * но экран не разъезжается.
 */
const MAX_SHIFT_PX = 20;
/** На границе (идти некуда) отклик вдвое жёстче. */
const EDGE_SHIFT_PX = 10;
/**
 * Дистанция, на которой жест считается «дошедшим до края»: подсказка к этому моменту
 * набирает полную непрозрачность, и отпускание = переход. Совпадает с `thresholdPx`
 * в `resolveSwipeDirection` — иначе подсказка обещала бы переход, которого не будет.
 */
const COMMIT_DISTANCE_PX = 60;
/** Возврат прогресса подсказки к нулю после отпускания без перехода. */
const SETTLE_MS = 240;
const RETURN_TRANSITION = 'transform .24s cubic-bezier(.2,.9,.3,1)';
/** Читается подсказкой (`PagerHint`): непрозрачность = прогресс жеста. */
const PROGRESS_VAR = '--swipe-progress';

export interface SwipeDragState {
  active: boolean;
  /** Куда поедем, если отпустить сейчас. null — ось ещё не решена или жест отменён. */
  direction: 'prev' | 'next' | null;
  /** true, когда в эту сторону идти некуда (и onEnd не задан). */
  atEdge: boolean;
}

export interface SwipePagerProps {
  enabled: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /**
   * Вызывается вместо onNext, когда canNext === false, но у экрана есть
   * терминальное действие (ридер: последняя глава дня → завершение дня).
   * Не задан ⇒ на границе просто резинка без коммита.
   */
  onEnd?: () => void;
  /** Состояние жеста для PagerHint. Вызывается только на СМЕНАХ состояния, не на каждый pointermove. */
  onDragChange?: (state: SwipeDragState) => void;
  /**
   * Слой над контентом (подсказка «N из M»). Живёт ВНЕ сдвигаемого узла: подсказка
   * стоит на месте по центру экрана, как бы далеко ни уехал палец.
   */
  overlay?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

type Axis = 'undecided' | 'horizontal' | 'vertical';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Резиновый отклик: |shift| растёт монотонно и упирается в `max`. */
export function shiftForDelta(dx: number, max: number): number {
  return (max * dx) / (Math.abs(dx) + max);
}

/** 0…1 — насколько жест «дошёл до края» (на 1 отпускание = переход). */
export function progressForDelta(dx: number): number {
  return Math.min(1, Math.abs(dx) / COMMIT_DISTANCE_PX);
}

export function SwipePager({
  enabled,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onEnd,
  onDragChange,
  overlay,
  className,
  children,
}: SwipePagerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<Axis>('undecided');
  const progressRef = useRef(0);
  const settleFrameRef = useRef<number | null>(null);
  const lastDragStateRef = useRef<SwipeDragState>({ active: false, direction: null, atEdge: false });

  useEffect(
    () => () => {
      if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current);
    },
    [],
  );

  const emitDragChange = (next: SwipeDragState) => {
    const prev = lastDragStateRef.current;
    if (prev.active === next.active && prev.direction === next.direction && prev.atEdge === next.atEdge) return;
    lastDragStateRef.current = next;
    onDragChange?.(next);
  };

  const cancelSettle = () => {
    if (settleFrameRef.current === null) return;
    cancelAnimationFrame(settleFrameRef.current);
    settleFrameRef.current = null;
  };

  const setProgress = (value: number) => {
    progressRef.current = value;
    rootRef.current?.style.setProperty(PROGRESS_VAR, String(value));
  };

  /**
   * Прогресс гаснет не мгновенно, а вместе с возвратом страницы: отпустил, не дойдя
   * до края — подсказка тает, пока контент едет назад. Тянем в JS, а не transition:
   * CSS-переменную без `@property` анимировать нельзя.
   */
  const settleProgress = () => {
    cancelSettle();
    const from = progressRef.current;
    if (from === 0) return;
    const startedAt = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - startedAt) / SETTLE_MS);
      setProgress(from * (1 - t));
      settleFrameRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    settleFrameRef.current = requestAnimationFrame(step);
  };

  const applyTransform = (shift: number, withTransition: boolean) => {
    const node = contentRef.current;
    if (!node) return;
    node.style.transition = withTransition ? RETURN_TRANSITION : '';
    if (prefersReducedMotion()) {
      node.style.transform = '';
      return;
    }
    node.style.transform = shift === 0 ? '' : `translateX(${shift}px)`;
  };

  const resetDrag = (commit: boolean) => {
    applyTransform(0, true);
    settleProgress();
    startRef.current = null;
    axisRef.current = 'undecided';
    emitDragChange({ active: false, direction: commit ? lastDragStateRef.current.direction : null, atEdge: false });
  };

  const handlers = !enabled
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent) => {
          cancelSettle();
          startRef.current = { x: e.clientX, y: e.clientY };
          axisRef.current = 'undecided';
        },
        onPointerMove: (e: React.PointerEvent) => {
          const start = startRef.current;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;

          if (axisRef.current === 'undecided') {
            if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
            axisRef.current = Math.abs(dx) <= 1.5 * Math.abs(dy) ? 'vertical' : 'horizontal';
            if (axisRef.current === 'horizontal') {
              emitDragChange({ active: true, direction: null, atEdge: false });
            }
          }

          if (axisRef.current !== 'horizontal') return;

          const direction: 'prev' | 'next' = dx < 0 ? 'next' : 'prev';
          const atEdge =
            (direction === 'next' && !canNext && !onEnd) || (direction === 'prev' && !canPrev);
          applyTransform(shiftForDelta(dx, atEdge ? EDGE_SHIFT_PX : MAX_SHIFT_PX), false);
          // Прогресс пишется CSS-переменной, а не стейтом: подсказка следует за пальцем
          // без ререндера страницы песни/главы на каждый pointermove.
          setProgress(progressForDelta(dx));
          emitDragChange({ active: true, direction, atEdge });
        },
        onPointerUp: (e: React.PointerEvent) => {
          const start = startRef.current;
          const wasHorizontal = axisRef.current === 'horizontal';
          if (!start || !wasHorizontal) {
            resetDrag(false);
            return;
          }

          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
          const direction = resolveSwipeDirection(start.x, dx, dy, viewportWidth);

          resetDrag(true);

          if (direction === 'left') {
            if (canNext) {
              console.debug('[SwipePager] commit', { direction: 'next', canPrev, canNext });
              onNext();
            } else if (onEnd) {
              console.debug('[SwipePager] commit', { direction: 'end', canPrev, canNext });
              onEnd();
            } else {
              console.debug('[SwipePager] rejected', { dx, dy, reason: 'at-edge-next' });
            }
          } else if (direction === 'right') {
            if (canPrev) {
              console.debug('[SwipePager] commit', { direction: 'prev', canPrev, canNext });
              onPrev();
            } else {
              console.debug('[SwipePager] rejected', { dx, dy, reason: 'at-edge-prev' });
            }
          } else {
            console.debug('[SwipePager] rejected', { dx, dy, reason: 'threshold' });
          }
        },
        onPointerCancel: () => {
          resetDrag(false);
        },
      };

  return (
    <div ref={rootRef} data-swipe-pager className={className} {...handlers}>
      {/* Сдвигается только этот узел — оверлей (подсказка) остаётся неподвижным. */}
      <div ref={contentRef} data-swipe-pager-content className="h-full w-full">
        {children}
      </div>
      {overlay}
    </div>
  );
}
