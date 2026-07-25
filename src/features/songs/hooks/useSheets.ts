'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { pitch, sheetCount, sheetPageHeight } from '../lib/sheets';

/** Дебаунс перестроек по «шумным» источникам: слайдер шрифта, resize, поворот (§4.2). */
const REBUILD_DEBOUNCE_MS = 120;

export interface SheetsMetrics {
  /** Число листов; 1 — пока не измерено или контент уже экрана. */
  count: number;
  /** Шаг сдвига потока листа, px. */
  pitch: number;
  /** Ширина потока листа, px (0 — ещё не измерено). */
  width: number;
  /** Высота потока страницы, px (0 — ещё не измерено). */
  pageHeight: number;
}

const EMPTY: SheetsMetrics = { count: 1, pitch: 0, width: 0, pageHeight: 0 };

/**
 * Правый край последней непустой секции. `scrollWidth` тут не годится: multicol
 * резервирует пустую хвостовую колонку (подводный камень 3, §4.2).
 */
function measureMaxSectionRight(source: HTMLElement): number {
  source.scrollLeft = 0;
  const origin = source.getBoundingClientRect().left;
  let maxRight = 0;
  source.querySelectorAll('.cproSongSection').forEach((section) => {
    const rect = section.getBoundingClientRect();
    if (rect.height > 0) maxRight = Math.max(maxRight, rect.right - origin);
  });
  return maxRight;
}

/** Высота содержимого скролл-контейнера без его собственных полей + верхнее поле. */
function viewportBox(el: HTMLElement): { height: number; paddingTop: number } {
  const style = getComputedStyle(el);
  const paddingTop = parseFloat(style.paddingTop);
  const paddingBottom = parseFloat(style.paddingBottom);
  const padding = (Number.isFinite(paddingTop) ? paddingTop : 0) + (Number.isFinite(paddingBottom) ? paddingBottom : 0);
  return { height: el.clientHeight - padding, paddingTop: Number.isFinite(paddingTop) ? paddingTop : 0 };
}

/**
 * Сколько высоты съедает всё, что нарисовано над потоком (шапка песни). Считается
 * от верха контента скролл-контейнера и не зависит от его текущего скролла.
 * Без этого страница выходит ровно на высоту шапки длиннее экрана — и в
 * постраничном режиме появляется вертикальный скролл, которого там быть не должно.
 */
function chromeAboveFlow(source: HTMLElement, viewport: HTMLElement, paddingTop: number): number {
  const offset = source.getBoundingClientRect().top + viewport.scrollTop - viewport.getBoundingClientRect().top - paddingTop;
  return Math.max(0, Math.round(offset));
}

/**
 * Измеряет источник (единый multicol-поток) и отдаёт параметры листов-«окон» §4.2.
 * Перестраивается на смену колонок/шрифта/плотности/режима, resize и поворот экрана.
 *
 * Клон листа обязан жить внутри того же контейнера с той же типографикой
 * (подводный камень 2) — за это отвечает разметка `SongView`, здесь только числа.
 */
export function useSheets(params: {
  enabled: boolean;
  sourceRef: RefObject<HTMLElement | null>;
  viewportRef?: RefObject<HTMLElement | null>;
  /** Строка-подпись раскладки: любое её изменение = перестройка (колонки, плотность, режим…). */
  layoutSignature: string;
  /** Размер шрифта — отдельно, потому что приходит слайдером и требует дебаунса. */
  fontSize: number;
  /** Сколько высоты вьюпорта занимает обвязка режима (поле листа / панель листалки). */
  reservedHeight: number;
}): SheetsMetrics {
  const { enabled, sourceRef, viewportRef, layoutSignature, fontSize, reservedHeight } = params;
  const [metrics, setMetrics] = useState<SheetsMetrics>(EMPTY);
  const pageHeight = metrics.pageHeight;
  const previousFontSize = useRef(fontSize);

  useEffect(() => {
    // Выключенный режим стейт не сбрасывает: наружу и так отдаётся EMPTY, а
    // сохранённые числа переиспользуются при возврате в постраничный режим.
    if (!enabled) return;

    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const measure = () => {
      const source = sourceRef.current;
      if (!source) return;

      const viewport = viewportRef?.current;
      let nextPageHeight = pageHeight;
      if (viewport) {
        const box = viewportBox(viewport);
        nextPageHeight = sheetPageHeight(box.height, reservedHeight + chromeAboveFlow(source, viewport, box.paddingTop));
      }

      // Разбивка на колонки зависит от высоты потока, а высота приезжает CSS-переменной.
      // Пока она не применена к DOM, мерить ширину бессмысленно — ждём следующего прохода
      // (эффект перезапустится, потому что pageHeight в его зависимостях).
      if (Math.abs(nextPageHeight - pageHeight) > 1) {
        setMetrics((prev) => ({ ...prev, pageHeight: nextPageHeight }));
        return;
      }
      if (nextPageHeight <= 0) return;

      const width = source.clientWidth;
      const gap = parseFloat(getComputedStyle(source).columnGap);
      const nextPitch = pitch(width, gap);
      const next: SheetsMetrics = {
        count: sheetCount(measureMaxSectionRight(source), nextPitch),
        pitch: nextPitch,
        width,
        pageHeight: nextPageHeight,
      };

      setMetrics((prev) =>
        prev.count === next.count && prev.pitch === next.pitch && prev.width === next.width && prev.pageHeight === next.pageHeight
          ? prev
          : next,
      );
    };

    const schedule = (delay: number) => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      timer = setTimeout(() => {
        frame = requestAnimationFrame(measure);
      }, delay);
    };

    // Смена шрифта приходит слайдером — её дебаунсим; остальные причины мгновенные.
    const fontChanged = previousFontSize.current !== fontSize;
    previousFontSize.current = fontSize;
    schedule(fontChanged ? REBUILD_DEBOUNCE_MS : 0);

    const observer = new ResizeObserver(() => schedule(REBUILD_DEBOUNCE_MS));
    if (sourceRef.current) observer.observe(sourceRef.current);
    if (viewportRef?.current) observer.observe(viewportRef.current);
    const onOrientationChange = () => schedule(REBUILD_DEBOUNCE_MS);
    window.addEventListener('orientationchange', onOrientationChange);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('orientationchange', onOrientationChange);
    };
  }, [enabled, sourceRef, viewportRef, layoutSignature, fontSize, reservedHeight, pageHeight]);

  return enabled ? metrics : EMPTY;
}
