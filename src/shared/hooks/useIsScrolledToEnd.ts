'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Долистан ли скролл-контейнер до низа (с допуском `thresholdPx`). Контейнер без
 * прокрутки считается долистанным: конца уже видно. `contentKey` — смена контента
 * (другая песня), после которой нужно перемерить без scroll-события.
 */
export function useIsScrolledToEnd(
  ref: RefObject<HTMLElement | null>,
  { thresholdPx = 24, contentKey }: { thresholdPx?: number; contentKey?: unknown } = {}
): boolean {
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - thresholdPx);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    const content = el.firstElementChild;
    if (content) observer?.observe(content);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [ref, thresholdPx, contentKey]);

  return atEnd;
}
