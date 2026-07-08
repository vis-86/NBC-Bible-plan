'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseScrollDirectionOptions {
  /** Дельта скролла вниз (px), после которой прячем. 0 → любое движение вниз. */
  hideThreshold?: number;
  /** Минимальная дельта скролла вверх (px) для показа. */
  showThreshold?: number;
  /** Зона у верха (px): движение вверх внутри неё всегда показывает chrome. */
  topThreshold?: number;
}

export interface ScrollDirectionHandle {
  hidden: boolean;
  /** Внешнее управление (короткая глава без скролла и т.п.) — синхронно с внутренним состоянием хука. */
  setHidden: (hidden: boolean) => void;
  /**
   * Вызвать ПЕРЕД программным изменением scrollTop (сброс к началу главы):
   * следующее scroll-событие только пересинхронизирует lastScrollTop, не
   * трактуясь как «скролл вверх» (иначе прыжок к 0 показывал бы chrome).
   */
  ignoreNextScroll: () => void;
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
 * (не window — у ридера скроллится внутренний div). Любое движение вниз
 * (> hideThreshold, по умолчанию 0) → hidden сразу; вверх > showThreshold
 * или движение вверх у верха (scrollTop < topThreshold) → visible.
 *
 * Показ у верха требует именно движения ВВЕРХ (delta < 0): позиция «у верха»
 * сама по себе не показывает chrome — после перехода на новую главу со
 * скрытым chrome (scrollTop сброшен в 0) он должен оставаться скрытым.
 *
 * iOS elastic overscroll выдаёт scrollTop за пределами [0, maxScrollTop] в обе
 * стороны (bounce на верху/низу) — такие показания игнорируются целиком, иначе
 * bounce на дне главы даёт ложную смену направления и chrome мерцает.
 */
export function useScrollDirection(
  ref: React.RefObject<HTMLElement | null>,
  { hideThreshold = 0, showThreshold = 12, topThreshold = 24 }: UseScrollDirectionOptions = {}
): ScrollDirectionHandle {
  const [hidden, setHiddenState] = useState(false);
  const lastScrollTop = useRef(0);
  const ticking = useRef(false);
  const ignoreNext = useRef(false);

  const setHidden = useCallback((next: boolean) => {
    setHiddenState((prev) => {
      if (prev !== next) {
        console.debug('[ChromeVisibility] setHidden (external)', next);
      }
      return next;
    });
  }, []);

  const ignoreNextScroll = useCallback(() => {
    ignoreNext.current = true;
  }, []);

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

        if (ignoreNext.current) {
          // Программный сброс scrollTop (смена главы) — только пересинхронизация.
          ignoreNext.current = false;
          lastScrollTop.current = scrollTop;
          return;
        }

        const delta = scrollTop - lastScrollTop.current;

        if (delta > hideThreshold) {
          setHiddenState((prevHidden) => {
            if (!prevHidden) {
              console.debug('[ChromeVisibility] visible→hidden', { scrollTop, delta });
            }
            return true;
          });
        } else if (delta < 0 && (scrollTop < topThreshold || delta < -showThreshold)) {
          setHiddenState((prevHidden) => {
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
  }, [ref, hideThreshold, showThreshold, topThreshold]);

  return useMemo(
    () => ({ hidden, setHidden, ignoreNextScroll }),
    [hidden, setHidden, ignoreNextScroll]
  );
}
