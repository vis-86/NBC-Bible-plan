'use client';

import { useRef } from 'react';
import { resolveSwipeDirection } from '@/shared/hooks/useHorizontalSwipe';

const AXIS_LOCK_PX = 8;
const EDGE_RESISTANCE = 0.35;
const RETURN_TRANSITION = 'transform .24s cubic-bezier(.2,.9,.3,1)';

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
  className?: string;
  children: React.ReactNode;
}

type Axis = 'undecided' | 'horizontal' | 'vertical';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function SwipePager({
  enabled,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onEnd,
  onDragChange,
  className,
  children,
}: SwipePagerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<Axis>('undecided');
  const lastDragStateRef = useRef<SwipeDragState>({ active: false, direction: null, atEdge: false });

  const emitDragChange = (next: SwipeDragState) => {
    const prev = lastDragStateRef.current;
    if (prev.active === next.active && prev.direction === next.direction && prev.atEdge === next.atEdge) return;
    lastDragStateRef.current = next;
    onDragChange?.(next);
  };

  const applyTransform = (dx: number, withTransition: boolean) => {
    const node = rootRef.current;
    if (!node) return;
    node.style.transition = withTransition ? RETURN_TRANSITION : '';
    if (prefersReducedMotion()) {
      node.style.transform = '';
      return;
    }
    node.style.transform = dx === 0 ? '' : `translateX(${dx}px)`;
  };

  const resetDrag = (commit: boolean) => {
    applyTransform(0, true);
    startRef.current = null;
    axisRef.current = 'undecided';
    emitDragChange({ active: false, direction: commit ? lastDragStateRef.current.direction : null, atEdge: false });
  };

  const handlers = !enabled
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent) => {
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
          applyTransform(atEdge ? dx * EDGE_RESISTANCE : dx, false);
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
      {children}
    </div>
  );
}
