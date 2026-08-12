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

/**
 * Активные указатели ВСЕЙ страницы, а не одного слоя.
 *
 * В постраничном режиме слоёв несколько — по одному на лист, — и пальцы двухпальцевого
 * жеста легко попадают на разные листы (границу листа видно на экране почти всегда).
 * Пока счёт вёлся внутри слоя, каждый слой видел ровно один палец и честно рисовал им
 * штрих: прокрутка и зум превращались в две линии поперёк песни.
 *
 * Модульная область — осознанно: страница песни на экране одна, а альтернатива
 * (контекст/провайдер вокруг всех листов) добавляет слой ради счётчика из двух чисел.
 */
const activePointers = new Map<number, { clientX: number; clientY: number; type: string }>();

/** Есть ли на экране перо. Пока оно есть, касания пальцем игнорируются целиком. */
function hasActivePen(): boolean {
  for (const pointer of activePointers.values()) if (pointer.type === 'pen') return true;
  return false;
}

/** Слой, на котором начался жест: только он отдаёт наверх сдвиг и масштаб. */
let gestureOwner: object | null = null;

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

    /** Ключ этого слоя во владении жестом. */
    const layerToken = {};
    /** Указатели, зарегистрированные ЭТИМ слоем — только их он и убирает за собой. */
    const ownPointers = new Set<number>();
    let drawingId: number | null = null;
    let gestureState: { distance: number; centerX: number; centerY: number } | null = null;

    const forgetPointer = (pointerId: number) => {
      activePointers.delete(pointerId);
      ownPointers.delete(pointerId);
      if (activePointers.size < 2) {
        gestureState = null;
        if (gestureOwner === layerToken) gestureOwner = null;
      }
    };

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
      const [a, b] = [...activePointers.values()];
      return {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        centerX: (a.clientX + b.clientX) / 2,
        centerY: (a.clientY + b.clientY) / 2,
      };
    };

    /**
     * Перо главнее пальца. Системного palm rejection в браузере нет, поэтому ладонь,
     * лежащая на листе, иначе либо рисует сама, либо (как второй указатель) превращает
     * штрих пера в двухпальцевый жест. Пришло перо — касания пальцем сбрасываем вместе
     * с уже начатым ими штрихом.
     */
    const dropTouchPointers = () => {
      let dropped = false;
      for (const [pointerId, pointer] of activePointers) {
        if (pointer.type === 'pen') continue;
        activePointers.delete(pointerId);
        ownPointers.delete(pointerId);
        dropped = true;
      }
      if (!dropped) return;
      gestureState = null;
      // Штрих мог начаться и на соседнем листе: сессия рисования одна на песню,
      // поэтому отмена черновика идёт наверх в любом случае.
      if (drawingId !== null) stopDrawing(true);
      else handlers.current.onCancel();
    };

    const onPointerDown = (e: PointerEvent) => {
      const ignore = handlers.current.ignoreSelector;
      if (ignore && e.target instanceof Element && e.target.closest(ignore)) return;
      if (e.pointerType !== 'pen' && hasActivePen()) return;
      if (e.pointerType === 'pen') dropTouchPointers();
      activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY, type: e.pointerType });
      ownPointers.add(e.pointerId);
      if (activePointers.size === 1) gestureOwner = layerToken;

      if (activePointers.size >= 2) {
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
      const tracked = activePointers.get(e.pointerId);
      if (tracked) activePointers.set(e.pointerId, { ...tracked, clientX: e.clientX, clientY: e.clientY });

      if (activePointers.size >= 2) {
        // Второй палец мог опуститься на СОСЕДНИЙ лист — тогда `pointerdown` этого слоя
        // не сработал, и штрих здесь всё ещё идёт. Гасим его на первом же движении.
        stopDrawing(true);
        if (gestureOwner !== layerToken || !handlers.current.onGesture) return;
        // Отсчёт мог не начаться там же, где начался жест (см. выше) — заводим его лениво.
        if (!gestureState) {
          gestureState = gestureMetrics();
          return;
        }
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
      forgetPointer(e.pointerId);
      if (e.pointerId === drawingId) stopDrawing(false);
    };

    const onPointerCancel = (e: PointerEvent) => {
      forgetPointer(e.pointerId);
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
      // Реестр указателей общий на страницу — за собой слой убирает только своё,
      // иначе размонтированный лист унёс бы палец, лежащий на соседнем.
      for (const pointerId of ownPointers) activePointers.delete(pointerId);
      ownPointers.clear();
      if (gestureOwner === layerToken) gestureOwner = null;
    };
  }, [targetRef, enabled]);
}
