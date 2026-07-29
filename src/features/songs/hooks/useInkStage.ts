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
 * | вкл             | 1 палец прокручивает, 2 зумят | рисует | включён (`pan-x pan-y`) |
 *
 * Нативного зума страницы нет НИГДЕ в приложении (`touch-action` без `pinch-zoom`,
 * viewport `maximum-scale=1`, `PageZoomGuard` для iOS): единственный зум — этот.
 * Поэтому владение прокруткой разведено жёстко: где скроллит браузер (`penOnly`),
 * жест отдаёт только масштаб — иначе сдвиг центра пальцев приезжает дважды.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { InkGesture } from './useInkInput';

export const INK_MIN_ZOOM = 1;
export const INK_MAX_ZOOM = 4;

export interface UseInkStageOptions {
  /** Скролл-контейнер страницы песни. */
  viewportRef: RefObject<HTMLElement | null>;
  /** Внутренний контейнер, к которому применяется `scale`. */
  stageRef: RefObject<HTMLElement | null>;
  active: boolean;
  /**
   * «Только стилус»: прокруткой владеет браузер (`touch-action: pan-x pan-y`), и жест
   * обязан отдавать ТОЛЬКО зум. Иначе сдвиг центра пальцев приезжает дважды — нативным
   * скроллом и нашим `scrollTop -= dy` — и лист уезжает вдвое быстрее пальцев.
   */
  penOnly?: boolean;
}

function clampZoom(value: number): number {
  return Math.min(INK_MAX_ZOOM, Math.max(INK_MIN_ZOOM, value));
}

export function useInkStage({ viewportRef, stageRef, active, penOnly = false }: UseInkStageOptions) {
  const [zoom, setZoom] = useState(1);
  /**
   * Натуральный размер листа (до `scale`). `transform` не меняет layout-размер, поэтому
   * без явных width/height на обёртке диапазон прокрутки не растёт и правый с нижним
   * краем увеличенного листа недостижимы.
   */
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  });

  /**
   * Мерить лист можно ТОЛЬКО в масштабе 1×. Обёртка задаёт ширину `natural * zoom`,
   * лист внутри неё — блок и растягивается на неё же; измерение под зумом скормило бы
   * эту ширину обратно в обёртку, и та росла бы степенью масштаба на каждом кадре
   * жеста (лист «убегал» из-под пальцев). При зуме ширина листа зафиксирована
   * измеренной (`stageStyle`), поэтому пересчитывать её и незачем.
   */
  const measureNatural = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || zoomRef.current !== 1) return;
    const width = stage.offsetWidth;
    const height = stage.offsetHeight;
    setNaturalSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, [stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    measureNatural();
    const observer = new ResizeObserver(() => measureNatural());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef, measureNatural]);

  /**
   * Позиция прокрутки, которую нужно выставить ПОСЛЕ того, как обёртка выросла под
   * новый масштаб. Раньше её ставили в `requestAnimationFrame` — и она приезжала
   * раньше, чем React коммитил новую высоту обёртки: браузер обрезал `scrollTop` по
   * СТАРОМУ диапазону прокрутки, и строка под пальцами уезжала вниз тем сильнее,
   * чем ближе к низу листа зумили.
   */
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

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
      console.debug('[FIX] ink stage zoom', { next, penOnly });
      pendingScroll.current = {
        left: anchorX * ratio - (clientX - box.left),
        top: anchorY * ratio - (clientY - box.top),
      };
    },
    [viewportRef, penOnly]
  );

  // Прокрутка правится в layout-эффекте — в том же кадре, но уже по обновлённому DOM
  // (обёртка выросла ⇒ диапазон прокрутки новый) и до отрисовки, поэтому лист не дёргается.
  useLayoutEffect(() => {
    const target = pendingScroll.current;
    const viewport = viewportRef.current;
    if (!target || !viewport) return;
    pendingScroll.current = null;
    viewport.scrollLeft = target.left;
    viewport.scrollTop = target.top;
  }, [zoom, naturalSize, viewportRef]);

  /**
   * Двухпальцевый жест: центр двигает лист, изменение расстояния — масштабирует.
   * Сдвиг применяем только там, где лист заморожен: при «только стилус» его уже
   * отработал нативный скролл (см. `penOnly` в опциях).
   */
  const applyGesture = useCallback(
    (gesture: InkGesture) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (!penOnly) {
        viewport.scrollLeft -= gesture.dx;
        viewport.scrollTop -= gesture.dy;
      }
      if (Math.abs(gesture.scale - 1) > 0.005) zoomAt(gesture.scale, gesture.clientX, gesture.clientY);
    },
    [viewportRef, zoomAt, penOnly]
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

  // Вернулись в 1× (вышли из режима, сбросили масштаб) — перемеряем: пока лист был
  // увеличен, `measureNatural` намеренно молчал, и размер мог устареть (сменили шрифт,
  // повернули планшет).
  useEffect(() => {
    if (zoom === 1) measureNatural();
  }, [zoom, measureNatural]);

  /** Стиль обёртки: размер растёт вместе с масштабом, иначе край листа недостижим. */
  const wrapperStyle =
    zoom === 1 || !naturalSize
      ? undefined
      : { width: naturalSize.width * zoom, height: naturalSize.height * zoom };

  /**
   * Стиль листа: масштаб + ЖЁСТКАЯ ширина. Без неё лист как блок растянулся бы на
   * увеличенную обёртку — раскладка песни поехала бы прямо во время жеста (колонки
   * шире, строки переносятся иначе), а измерение вернуло бы эту ширину обратно
   * в обёртку. Зум обязан менять только масштаб, не раскладку.
   */
  const stageStyle =
    zoom === 1 || !naturalSize
      ? undefined
      : { transform: `scale(${zoom})`, transformOrigin: '0 0' as const, width: naturalSize.width };

  return { zoom, applyGesture, reset, wrapperStyle, stageStyle };
}
