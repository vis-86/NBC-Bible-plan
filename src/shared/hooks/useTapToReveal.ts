'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Максимальный сдвиг пальца (px), при котором жест ещё считается тапом, а не скроллом/свайпом. */
const TAP_MOVE_PX = 8;
/** Максимальная длительность тапа (мс). Дольше — это удержание (в песне оно принадлежит пометкам). */
const TAP_MAX_MS = 400;
/** Элементы со своим поведением: тап по ним не должен ещё и возвращать хром. */
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, label, [role="button"], [contenteditable="true"]';

export interface UseTapToRevealOptions {
  /** Выключает распознавание целиком (открытая шторка, режим рисования). */
  enabled?: boolean;
}

/**
 * Возврат скрытого хрома по короткому тапу в область чтения.
 *
 * Автоскрытие по скроллу оставляет ровно один способ вернуть шапку — прокрутить вверх.
 * Когда человек дочитал до места и просто хочет открыть настройки или уйти назад, это
 * лишнее движение: тап по листу отдаёт хром обратно, ничего не пролистывая.
 *
 * Тап отличается от скролла тремя условиями сразу: палец не уехал (`TAP_MOVE_PX`),
 * не задержался (`TAP_MAX_MS`) и `scrollTop` не изменился — последнее отсекает тап,
 * которым гасят инерцию прокрутки (он визуально неподвижен, но список останавливает).
 */
export function useTapToReveal(
  ref: RefObject<HTMLElement | null>,
  onReveal: () => void,
  { enabled = true }: UseTapToRevealOptions = {}
): void {
  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onRevealRef.current = onReveal;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let startX = 0;
    let startY = 0;
    let startAt = 0;
    let startScrollTop = 0;
    let tracking = false;

    const onPointerDown = (e: PointerEvent) => {
      // Мультитач — это зум/пан листа, не тап.
      if (!e.isPrimary) {
        tracking = false;
        return;
      }
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
      // performance.now(), а не e.timeStamp: у последнего epoch различается между
      // браузерами, и разница двух событий не везде выражена в мс от одной точки.
      startAt = performance.now();
      startScrollTop = el.scrollTop;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!tracking) return;
      tracking = false;

      if (Math.abs(e.clientX - startX) > TAP_MOVE_PX || Math.abs(e.clientY - startY) > TAP_MOVE_PX) return;
      if (performance.now() - startAt > TAP_MAX_MS) return;
      // Тап, погасивший инерцию прокрутки: палец неподвижен, но лист под ним ехал.
      if (el.scrollTop !== startScrollTop) return;
      if ((e.target as Element | null)?.closest(INTERACTIVE_SELECTOR)) return;

      console.debug('[useTapToReveal] tap');
      onRevealRef.current();
    };

    const onPointerCancel = () => {
      tracking = false;
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('pointerup', onPointerUp, { passive: true });
    el.addEventListener('pointercancel', onPointerCancel, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [ref, enabled]);
}
