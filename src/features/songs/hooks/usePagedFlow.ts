'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import { nextPageDelta } from '../lib/sheets';

export interface PagedFlow {
  /** Текущая страница, 0-based. */
  page: number;
  /** Листнуть на `delta` страниц (клавиша, тап, кнопка панели). */
  turn: (delta: number) => void;
}

/**
 * Горизонтальное листание одного потока (§4.4): клонирования нет, страница —
 * это `scrollLeft += pitch`. Клавиши и педали резолвит чистый `nextPageDelta`.
 *
 * Источник истины — позиция потока, а не React-стейт: при плавном скролле
 * промежуточные события «округляются» обратно в старую страницу, и стейт,
 * который сам же двигал бы поток, отменял бы собственный переход.
 */
export function usePagedFlow(params: {
  enabled: boolean;
  flowRef: RefObject<HTMLElement | null>;
  pitch: number;
  totalPages: number;
}): PagedFlow {
  const { enabled, flowRef, pitch, totalPages } = params;
  const [page, setPage] = useState(0);

  const turn = useCallback(
    (delta: number) => {
      const flow = flowRef.current;
      if (!delta || !flow || pitch <= 0) return;
      const current = Math.round(flow.scrollLeft / pitch);
      const next = Math.min(Math.max(current + delta, 0), Math.max(0, totalPages - 1));
      flow.scrollTo({ left: next * pitch });
    },
    [flowRef, pitch, totalPages],
  );

  useEffect(() => {
    const flow = flowRef.current;
    if (!enabled || !flow || pitch <= 0) return;

    const onScroll = () => {
      const next = Math.min(Math.max(Math.round(flow.scrollLeft / pitch), 0), Math.max(0, totalPages - 1));
      setPage((prev) => (prev === next ? prev : next));
    };
    onScroll();
    flow.addEventListener('scroll', onScroll, { passive: true });
    return () => flow.removeEventListener('scroll', onScroll);
  }, [enabled, flowRef, pitch, totalPages]);

  // Перестройка раскладки меняет шаг и число страниц: возвращаем поток на границу
  // страницы, иначе он остаётся посередине или за последней.
  useEffect(() => {
    const flow = flowRef.current;
    if (!enabled || !flow || pitch <= 0) return;
    const clamped = Math.min(Math.max(Math.round(flow.scrollLeft / pitch), 0), Math.max(0, totalPages - 1)) * pitch;
    if (Math.abs(flow.scrollLeft - clamped) > 1) flow.scrollTo({ left: clamped });
  }, [enabled, flowRef, pitch, totalPages]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Не перехватываем ввод: пробел в поле поиска/настроек должен печататься.
      // `target` — не всегда Element (у события на window это сам window).
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;

      const delta = nextPageDelta(event.key);
      if (!delta) return;
      event.preventDefault();
      turn(delta);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, turn]);

  return { page, turn };
}
