'use client';

import { useEffect, type RefObject } from 'react';
import { useScrollDirection } from './useScrollDirection';

export interface UseAutoHideOnScrollResult {
  hidden: boolean;
  /** Вызвать перед программным изменением scrollTop — см. useScrollDirection. */
  ignoreNextScroll: () => void;
}

/**
 * Тонкая обёртка над `useScrollDirection` для страниц без специфики ридера
 * (список/деталь песен и т.п.): та же детекция направления скролла + guard
 * короткого контента — если контент не скроллится (после перерендера,
 * помеченного сменой `contentReady`), chrome принудительно остаётся видимым,
 * т.к. скрыть его нечем (scroll-событий не будет).
 */
export function useAutoHideOnScroll(
  ref: RefObject<HTMLElement | null>,
  contentReady?: unknown
): UseAutoHideOnScrollResult {
  const { hidden, setHidden, ignoreNextScroll } = useScrollDirection(ref);

  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight <= el.clientHeight) {
      setHidden(false);
    }
  }, [contentReady, ref, setHidden]);

  return { hidden, ignoreNextScroll };
}
