'use client';

import { useEffect, useRef, useState } from 'react';

interface UseScrollDirectionOptions {
  /** Минимальная дельта скролла (px) для смены интента. */
  threshold?: number;
  /** scrollTop ниже этого порога всегда трактуется как «visible» (у верха). */
  topThreshold?: number;
}

// jsdom (юнит-тесты) не реализует requestAnimationFrame — фолбэк на setTimeout
// сохраняет троттлинг тестируемым (через vi.useFakeTimers) без полифилла в setup.
const scheduleFrame: (cb: () => void) => void =
  typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? (cb) => window.requestAnimationFrame(cb)
    : (cb) => {
        setTimeout(cb, 16);
      };

/**
 * Определяет интент скрытия нижнего chrome по направлению скролла ЭЛЕМЕНТА
 * (не window — у ридера скроллится внутренний div). Вниз > threshold → hidden,
 * вверх > threshold или у верха (scrollTop < topThreshold) → visible.
 *
 * iOS elastic overscroll выдаёт scrollTop за пределами [0, maxScrollTop] в обе
 * стороны (bounce на верху/низу) — такие показания игнорируются целиком, иначе
 * bounce на дне главы даёт ложную смену направления и chrome мерцает.
 */
export function useScrollDirection(
  ref: React.RefObject<HTMLElement | null>,
  { threshold = 12, topThreshold = 24 }: UseScrollDirectionOptions = {}
): boolean {
  const [hidden, setHidden] = useState(false);
  const lastScrollTop = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    lastScrollTop.current = el.scrollTop;

    const handleScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      scheduleFrame(() => {
        ticking.current = false;
        const node = ref.current;
        if (!node) return;

        const maxScrollTop = node.scrollHeight - node.clientHeight;
        const scrollTop = node.scrollTop;

        if (scrollTop < 0 || (maxScrollTop > 0 && scrollTop > maxScrollTop)) {
          // iOS bounce вне валидного диапазона — игнорируем, не трогаем lastScrollTop.
          return;
        }

        const delta = scrollTop - lastScrollTop.current;

        if (scrollTop < topThreshold) {
          setHidden((prevHidden) => {
            if (prevHidden) {
              console.debug('[ChromeVisibility] hidden→visible', { scrollTop, delta });
            }
            return false;
          });
        } else if (delta > threshold) {
          setHidden((prevHidden) => {
            if (!prevHidden) {
              console.debug('[ChromeVisibility] visible→hidden', { scrollTop, delta });
            }
            return true;
          });
        } else if (delta < -threshold) {
          setHidden((prevHidden) => {
            if (prevHidden) {
              console.debug('[ChromeVisibility] hidden→visible', { scrollTop, delta });
            }
            return false;
          });
        }

        lastScrollTop.current = scrollTop;
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [ref, threshold, topThreshold]);

  return hidden;
}
