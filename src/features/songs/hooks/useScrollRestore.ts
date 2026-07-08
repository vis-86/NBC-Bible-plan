'use client';

import { useEffect, useRef, type RefObject } from 'react';

// jsdom (юнит-тесты) не реализует requestAnimationFrame — фолбэк на setTimeout
// сохраняет троттлинг тестируемым (см. useScrollDirection).
const scheduleFrame: (cb: () => void) => void =
  typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? (cb) => window.requestAnimationFrame(cb)
    : (cb) => {
        setTimeout(cb, 16);
      };

let warnedSessionStorageUnavailable = false;

function readScrollTop(key: string): number {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? Number(raw) || 0 : 0;
  } catch (err) {
    if (!warnedSessionStorageUnavailable) {
      warnedSessionStorageUnavailable = true;
      console.warn('[useScrollRestore] sessionStorage unavailable', err);
    }
    return 0;
  }
}

function writeScrollTop(key: string, value: number): void {
  try {
    sessionStorage.setItem(key, String(value));
  } catch (err) {
    if (!warnedSessionStorageUnavailable) {
      warnedSessionStorageUnavailable = true;
      console.warn('[useScrollRestore] sessionStorage unavailable', err);
    }
  }
}

/**
 * Сохраняет/восстанавливает позицию скролла элемента в `sessionStorage` по `key`.
 * Восстановление — один раз, когда `ready` становится `true` (контент отрендерен).
 * Значение НЕ чистится после восстановления: возврат на таб «Песни» с «Главной»
 * тоже вернёт позицию — поведение нативных табов, это осознанно.
 */
export function useScrollRestore(
  ref: RefObject<HTMLElement | null>,
  key: string,
  ready: boolean,
  onBeforeRestore?: () => void
): void {
  const restoredRef = useRef(false);
  const ticking = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      scheduleFrame(() => {
        ticking.current = false;
        const node = ref.current;
        if (!node) return;
        writeScrollTop(key, node.scrollTop);
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [ref, key]);

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    const el = ref.current;
    if (!el) return;

    restoredRef.current = true;
    const savedScrollTop = readScrollTop(key);
    if (savedScrollTop > 0) {
      onBeforeRestore?.();
      el.scrollTop = savedScrollTop;
    }
  }, [ready, ref, key, onBeforeRestore]);
}
