'use client';

import { useEffect } from 'react';

/**
 * Запрет нативного зума страницы (без UI, монтируется в root layout).
 *
 * `maximum-scale=1, user-scalable=no` в viewport-мете iOS Safari игнорирует ради
 * доступности, поэтому там пинч гасится единственным доступным способом — отменой
 * проприетарных `gesture*`-событий. `touch-action` без `pinch-zoom` (globals.css)
 * закрывает Android Chrome и десктоп; здесь — только добор iOS.
 *
 * Ctrl/⌘ + колесо на десктопе НЕ трогаем: это системный зум браузера, не жест
 * приложения, и отбирать его у пользователя незачем.
 *
 * Свой зум листа в режиме пометок построен на pointer-событиях (useInkInput) —
 * отмена `gesture*` его не задевает.
 */
export default function PageZoomGuard() {
  useEffect(() => {
    const block = (e: Event) => {
      e.preventDefault();
      console.debug('[FIX] blocked native page zoom', { type: e.type });
    };
    // Имена перечислены строками: `gesture*` нет в `DocumentEventMap` (WebKit-only).
    const types = ['gesturestart', 'gesturechange', 'gestureend'];
    for (const type of types) document.addEventListener(type, block, { passive: false });
    return () => {
      for (const type of types) document.removeEventListener(type, block);
    };
  }, []);
  return null;
}
