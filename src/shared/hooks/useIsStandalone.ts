'use client';

import { useSyncExternalStore } from 'react';

/** iOS Safari выставляет нестандартный navigator.standalone. */
type IOSNavigator = Navigator & { standalone?: boolean };

const STANDALONE_QUERY = '(display-mode: standalone)';

/**
 * Запущено ли приложение как установленное PWA. Читаем через useSyncExternalStore:
 * SSR-снимок = false (нет hydration-варнинга), на клиенте подписываемся на смену
 * display-mode и учитываем iOS navigator.standalone.
 */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(STANDALONE_QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () =>
      window.matchMedia(STANDALONE_QUERY).matches ||
      (window.navigator as IOSNavigator).standalone === true,
    () => false,
  );
}
