'use client';

import { useSyncExternalStore } from 'react';

/**
 * Подписка на CSS media query. SSR-снимок = false (нет hydration-варнинга),
 * см. `useIsStandalone` для того же паттерна.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
