'use client';

import { useRef } from 'react';

export type SwipeDirection = 'left' | 'right' | null;

export interface ResolveSwipeOptions {
  edgeGuardPx?: number;
  thresholdPx?: number;
  ratio?: number;
}

/**
 * Чистая функция решения жеста — вынесена отдельно ради табличных тестов без DOM/pointer events.
 * Не стартует в `edgeGuardPx` от левого/правого края (там живёт системный back-свайп ОС —
 * перехват = сломанная навигация). Порог `thresholdPx` и соотношение `ratio` к |dy| отсекают
 * короткие/диагональные движения (иначе вертикальный скролл текста ловится как свайп).
 */
export function resolveSwipeDirection(
  startX: number,
  dx: number,
  dy: number,
  viewportWidth: number,
  { edgeGuardPx = 24, thresholdPx = 60, ratio = 1.5 }: ResolveSwipeOptions = {}
): SwipeDirection {
  if (startX <= edgeGuardPx || startX >= viewportWidth - edgeGuardPx) return null;
  if (Math.abs(dx) <= thresholdPx) return null;
  if (Math.abs(dx) <= ratio * Math.abs(dy)) return null;
  return dx < 0 ? 'left' : 'right';
}

export interface UseHorizontalSwipeOptions extends ResolveSwipeOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  enabled: boolean;
}

export interface SwipeHandlers {
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: () => void;
}

/**
 * Pointer events (не `touchstart`-only — работает и с трекпадом/стилусом), без новой
 * зависимости. `enabled=false` не навешивает обработчики вовсе (пустой объект спреда).
 */
export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  enabled,
  edgeGuardPx,
  thresholdPx,
  ratio,
}: UseHorizontalSwipeOptions): SwipeHandlers {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  if (!enabled) return {};

  const onPointerDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const direction = resolveSwipeDirection(start.x, dx, dy, viewportWidth, { edgeGuardPx, thresholdPx, ratio });
    if (direction === 'left') onSwipeLeft();
    else if (direction === 'right') onSwipeRight();
  };

  const onPointerCancel = () => {
    startRef.current = null;
  };

  return { onPointerDown, onPointerUp, onPointerCancel };
}
