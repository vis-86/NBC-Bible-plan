'use client';

/**
 * Зум и прокрутка листа внутри режима рукописных пометок (M10, T10).
 *
 * ПРАВКА СПЕКИ. §6 требует «лист заморожен, скролл выключен». Для длинной песни это
 * тупик: до второго куплета в режиме пометок не добраться. Заморозка нужна лишь
 * потому, что палец рисует, — значит и снимать её надо там, где палец не рисует:
 *
 * | «Только стилус» | Палец                        | Перо  | Нативный скролл       |
 * | :-------------- | :--------------------------- | :---- | :-------------------- |
 * | выкл            | 1 палец рисует, 2 прокручивают и зумят | рисует | выключен            |
 * | вкл             | прокручивает и зумит штатно  | рисует | включён (`pan-y`)     |
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { InkGesture } from './useInkInput';

export const INK_MIN_ZOOM = 1;
export const INK_MAX_ZOOM = 4;

export interface UseInkStageOptions {
  /** Скролл-контейнер страницы песни. */
  viewportRef: RefObject<HTMLElement | null>;
  /** Внутренний контейнер, к которому применяется `scale`. */
  stageRef: RefObject<HTMLElement | null>;
  active: boolean;
}

function clampZoom(value: number): number {
  return Math.min(INK_MAX_ZOOM, Math.max(INK_MIN_ZOOM, value));
}

export function useInkStage({ viewportRef, stageRef, active }: UseInkStageOptions) {
  const [zoom, setZoom] = useState(1);
  /**
   * Натуральный размер листа (до `scale`). `transform` не меняет layout-размер, поэтому
   * без явных width/height на обёртке диапазон прокрутки не растёт и правый с нижним
   * краем увеличенного листа недостижимы.
   */
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const measureNatural = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setNaturalSize({ width: stage.offsetWidth, height: stage.offsetHeight });
  }, [stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    measureNatural();
    const observer = new ResizeObserver(() => measureNatural());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef, measureNatural]);

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  });

  /** Зум вокруг точки экрана: без этого лист «убегает» из-под пальцев. */
  const zoomAt = useCallback(
    (factor: number, clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const next = clampZoom(zoomRef.current * factor);
      if (next === zoomRef.current) return;

      const box = viewport.getBoundingClientRect();
      const anchorX = viewport.scrollLeft + (clientX - box.left);
      const anchorY = viewport.scrollTop + (clientY - box.top);
      const ratio = next / zoomRef.current;

      zoomRef.current = next;
      setZoom(next);
      // Позицию правим сразу, а не эффектом: между рендерами лист успел бы дёрнуться.
      requestAnimationFrame(() => {
        viewport.scrollLeft = anchorX * ratio - (clientX - box.left);
        viewport.scrollTop = anchorY * ratio - (clientY - box.top);
      });
    },
    [viewportRef]
  );

  /** Двухпальцевый жест: центр двигает лист, изменение расстояния — масштабирует. */
  const applyGesture = useCallback(
    (gesture: InkGesture) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft -= gesture.dx;
      viewport.scrollTop -= gesture.dy;
      if (Math.abs(gesture.scale - 1) > 0.005) zoomAt(gesture.scale, gesture.clientX, gesture.clientY);
    },
    [viewportRef, zoomAt]
  );

  const reset = useCallback(() => {
    zoomRef.current = 1;
    setZoom(1);
  }, []);

  // Зум не персистится (§6): вышли из режима — вернулись к 1. Правка в рендер-фазе,
  // а не эффектом: setState в эффекте даёт лишний каскадный ререндер.
  const [seenActive, setSeenActive] = useState(active);
  if (seenActive !== active) {
    setSeenActive(active);
    if (!active) setZoom(1);
  }

  // Десктоп: колесо прокручивает замороженный лист, Ctrl/⌘ + колесо (пинч на трекпаде) зумит.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!active || !viewport) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX, e.clientY);
        return;
      }
      e.preventDefault();
      viewport.scrollTop += e.deltaY;
      viewport.scrollLeft += e.deltaX;
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [active, viewportRef, zoomAt]);

  /** Стиль обёртки: размер растёт вместе с масштабом, иначе край листа недостижим. */
  const wrapperStyle =
    zoom === 1 || !naturalSize
      ? undefined
      : { width: naturalSize.width * zoom, height: naturalSize.height * zoom };

  const stageStyle = zoom === 1 ? undefined : { transform: `scale(${zoom})`, transformOrigin: '0 0' as const };

  return { zoom, applyGesture, reset, wrapperStyle, stageStyle };
}
