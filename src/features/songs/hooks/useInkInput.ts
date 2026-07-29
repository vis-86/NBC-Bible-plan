'use client';

/**
 * Ввод указателя для слоя рисования (M10, §6/§7).
 *
 * Рисование и двухпальцевый жест живут в ОДНОМ хуке намеренно: они делят один поток
 * pointer-событий, и разнесённые по двум обработчикам они неизбежно расходятся во
 * взгляде на то, сколько сейчас пальцев на экране.
 */
import { useEffect, useRef, type RefObject } from 'react';
import type { LayerPoint } from '../lib/inkGeometry';

export interface InkGesture {
  /** Сдвиг центра жеста с прошлого кадра, в координатах экрана. */
  dx: number;
  dy: number;
  /** Множитель масштаба относительно прошлого кадра. */
  scale: number;
  /** Центр жеста в координатах экрана — точка, вокруг которой зумим. */
  clientX: number;
  clientY: number;
}

export interface UseInkInputOptions {
  targetRef: RefObject<HTMLElement | null>;
  /** Режим рисования включён. Выключено ⇒ хук не вешает обработчиков вовсе. */
  enabled: boolean;
  /**
   * «Только стилус»: рисует лишь `pointerType === 'pen'`, палец скроллит и зумит штатно.
   * В браузере системного palm rejection нет — это единственный способ отсечь ладонь.
   */
  penOnly: boolean;
  onBegin: (point: LayerPoint) => void;
  onMove: (point: LayerPoint) => void;
  onEnd: () => void;
  /** Штрих отменён: второй палец, `pointercancel`, уход указателя из окна. */
  onCancel: () => void;
  /** Двухпальцевый жест: прокрутка и зум замороженного листа. */
  onGesture?: (gesture: InkGesture) => void;
  /**
   * Селектор собственного UI слоя (поле ввода заметки, её панель действий). События
   * оттуда обработчик обязан игнорировать: иначе тап по полю открывает второе поле,
   * первое теряет фокус и отбрасывается пустым — заметку не набрать в принципе.
   */
  ignoreSelector?: string;
}

/** Точка события в координатах слоя с поправкой на текущий `transform: scale`. */
function toLayerPoint(el: HTMLElement, clientX: number, clientY: number, pressure: number): LayerPoint {
  const rect = el.getBoundingClientRect();
  // Масштаб берём из фактических размеров: так поправка верна для любого transform
  // на любом предке, а не только для того, о котором знает этот компонент.
  const scale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
  return {
    x: (clientX - rect.left) / (scale || 1),
    y: (clientY - rect.top) / (scale || 1),
    pressure,
  };
}

export function useInkInput({
  targetRef,
  enabled,
  penOnly,
  onBegin,
  onMove,
  onEnd,
  onCancel,
  onGesture,
  ignoreSelector,
}: UseInkInputOptions): void {
  // Хендлеры меняются каждый рендер (замыкают состояние), а слушатели вешаются один
  // раз на вход в режим — иначе жест рвётся на первом же обновлении черновика.
  const handlers = useRef({ onBegin, onMove, onEnd, onCancel, onGesture, penOnly, ignoreSelector });
  useEffect(() => {
    handlers.current = { onBegin, onMove, onEnd, onCancel, onGesture, penOnly, ignoreSelector };
  });

  useEffect(() => {
    const el = targetRef.current;
    if (!enabled || !el) return;

    /** Активные указатели на слое. Больше одного ⇒ это жест, а не штрих. */
    const pointers = new Map<number, { clientX: number; clientY: number }>();
    let drawingId: number | null = null;
    let gestureState: { distance: number; centerX: number; centerY: number } | null = null;

    const stopDrawing = (cancelled: boolean) => {
      if (drawingId === null) return;
      try {
        el.releasePointerCapture(drawingId);
      } catch {
        // Захвата могло и не быть — это нормально, не повод ронять жест.
      }
      drawingId = null;
      if (cancelled) handlers.current.onCancel();
      else handlers.current.onEnd();
    };

    const gestureMetrics = () => {
      const [a, b] = [...pointers.values()];
      return {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        centerX: (a.clientX + b.clientX) / 2,
        centerY: (a.clientY + b.clientY) / 2,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      const ignore = handlers.current.ignoreSelector;
      if (ignore && e.target instanceof Element && e.target.closest(ignore)) return;
      pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

      if (pointers.size >= 2) {
        // Второй указатель ОТМЕНЯЕТ уже начатый штрих: иначе каждый двухпальцевый
        // жест оставляет на листе случайную закорючку от первого пальца.
        stopDrawing(true);
        gestureState = gestureMetrics();
        return;
      }

      if (handlers.current.penOnly && e.pointerType !== 'pen') return;
      if (drawingId !== null) return;

      drawingId = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture бросает, если захват невозможен. Захват — не обязательное
        // условие жеста: без try/catch исключение убивало весь ввод (прототип).
      }
      e.preventDefault();
      handlers.current.onBegin(toLayerPoint(el, e.clientX, e.clientY, e.pressure || 0.5));
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

      if (pointers.size >= 2) {
        if (!gestureState || !handlers.current.onGesture) return;
        const next = gestureMetrics();
        handlers.current.onGesture({
          dx: next.centerX - gestureState.centerX,
          dy: next.centerY - gestureState.centerY,
          scale: gestureState.distance > 0 ? next.distance / gestureState.distance : 1,
          clientX: next.centerX,
          clientY: next.centerY,
        });
        gestureState = next;
        e.preventDefault();
        return;
      }

      if (e.pointerId !== drawingId) return;
      e.preventDefault();

      // Браузер склеивает точки быстрого штриха в одно `pointermove`. Без них линия
      // угловатая — но СПИСОК БЫВАЕТ ПУСТЫМ, и без фолбэка штрих терял все точки,
      // кроме первой (наступили в прототипе).
      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const samples = coalesced.length > 0 ? coalesced : [e];
      for (const sample of samples) {
        handlers.current.onMove(toLayerPoint(el, sample.clientX, sample.clientY, sample.pressure || 0.5));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) gestureState = null;
      if (e.pointerId === drawingId) stopDrawing(false);
    };

    const onPointerCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) gestureState = null;
      if (e.pointerId === drawingId) stopDrawing(true);
    };

    el.addEventListener('pointerdown', onPointerDown);
    // move/up слушаем на окне: слой перерисовывается покадрово, и обработчики,
    // повешенные на перерисовываемый узел, умирают вместе с ним посреди жеста.
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      stopDrawing(true);
    };
  }, [targetRef, enabled]);
}
