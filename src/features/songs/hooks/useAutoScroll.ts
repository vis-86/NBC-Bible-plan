'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { AUTOSCROLL_STEPS, DEFAULT_STEP_INDEX, pixelsPerSecond } from '../lib/autoScroll';
import { readSpeedStep, subscribeAutoScrollSpeed, writeSpeedStep } from '../lib/autoScrollSpeedStore';

/**
 * rAF-движок автоскролла (§8). Гонит нативный `scrollTop` контейнера — никаких
 * `transform`/CSS-анимаций: палец в любой момент перехватывает скролл, а прокрутка
 * реально двигает позицию (важно для «остановиться и допеть с места»).
 *
 * Скорость измеряется в строках/мин (`AUTOSCROLL_STEPS`), реальная высота строки в px
 * берётся из DOM (`getComputedStyle`), перевод — чистой `pixelsPerSecond`. Дробные
 * пиксели аккумулируются между кадрами, чтобы медленные ступени не «залипали» на нуле.
 *
 * Ручной скролл (`touchstart`/`wheel` по контейнеру) НЕ выключает автоскролл, а лишь
 * приостанавливает его на время жеста (`suspended`): подправить положение листа пальцем —
 * обычная часть чтения, и каждый раз возвращаться к кнопке было бы издевательством.
 * Движение продолжается само, когда прокрутка затихла (инерция докатилась). Выключают
 * автоскролл только кнопкой или доездом до низа (§8). FAB живёт ВНЕ контейнера (Task 4),
 * поэтому тап по нему до этих слушателей не долетает.
 */

/** Пауза после последнего касания/колеса, прежде чем движок поедет сам. */
const RESUME_DELAY_MS = 700;
/** Шаг проверки «прокрутка затихла»: инерция после свайпа катится дольше RESUME_DELAY_MS. */
const SETTLE_POLL_MS = 120;
/** Разгон до целевой скорости (ease-in), чтобы старт не был рывком. reduced-motion его снимает. */
const ACCELERATION_MS = 800;
/** Допуск «доехали до низа» в px: sub-pixel остатки не должны мешать сработать стопу. */
const BOTTOM_EPSILON_PX = 1;
/** Фолбэк-множитель высоты строки, если `getComputedStyle` не дал валидного значения. */
const FALLBACK_LINE_HEIGHT_MULTIPLIER = 1.5;
const FALLBACK_FONT_SIZE_PX = 16;

export interface UseAutoScrollParams {
  /** Скролл-контейнер, чей `scrollTop` двигает движок. */
  containerRef: RefObject<HTMLElement | null>;
  /** Идентификатор песни — его смена сбрасывает проигрывание. */
  songId: string;
  /** Активен только в режиме `scroll` при загруженной песне (гейтит вызывающий). */
  enabled: boolean;
  /**
   * Вызывается ПЕРЕД каждым программным сдвигом `scrollTop`. Страница передаёт сюда
   * `ignoreNextScroll` из `useAutoHideOnScroll` — иначе `useScrollDirection` примет
   * программный скролл за пользовательский и шапка задёргается на каждый кадр.
   */
  onBeforeProgrammaticScroll?: () => void;
}

export interface UseAutoScrollResult {
  playing: boolean;
  /**
   * Пользователь сейчас крутит лист сам: движок стоит, но режим остаётся включённым.
   * Экран снимает на это время фокус-режим (хром снова слушается жеста) — иначе шапку
   * было бы не вернуть, не выключив автоскролл.
   */
  suspended: boolean;
  /** Есть ли что скроллить (`scrollHeight > clientHeight`) — FAB прячется, если нет. */
  canScroll: boolean;
  /** Индекс текущей ступени скорости — per-song, персист в `autoScrollSpeedStore`. */
  step: number;
  setStep: (step: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
}

/**
 * Реальная высота строки лирики в px. Меряем по `.cproSongLine` (на нём задан
 * `line-height: var(--line-height)`), а не по контейнеру потока, где line-height = `normal`.
 * Провал замера → фолбэк `fontSize × 1.5`.
 */
function resolveLineHeightPx(container: HTMLElement): number {
  const flow = container.querySelector<HTMLElement>('[data-song-view-flow]');
  const line = flow?.querySelector<HTMLElement>('.cproSongLine') ?? flow ?? container;
  try {
    const cs = getComputedStyle(line);
    const lineHeight = Number.parseFloat(cs.lineHeight);
    if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
    const fontSize = Number.parseFloat(cs.fontSize);
    const base = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : FALLBACK_FONT_SIZE_PX;
    return base * FALLBACK_LINE_HEIGHT_MULTIPLIER;
  } catch {
    return FALLBACK_FONT_SIZE_PX * FALLBACK_LINE_HEIGHT_MULTIPLIER;
  }
}

const debug = (...args: unknown[]): void => {
  if (process.env.NODE_ENV !== 'production') console.debug('[useAutoScroll]', ...args);
};

export function useAutoScroll({ containerRef, songId, enabled, onBeforeProgrammaticScroll }: UseAutoScrollParams): UseAutoScrollResult {
  const [playing, setPlaying] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [canScrollMeasured, setCanScrollMeasured] = useState(false);

  // Внешний источник (localStorage) — не React state, поэтому через useSyncExternalStore,
  // а не эффект с setState (иначе каскадные ре-рендеры при подписке).
  const step = useSyncExternalStore(subscribeAutoScrollSpeed, () => readSpeedStep(songId), () => DEFAULT_STEP_INDEX);
  const setStep = useCallback((next: number) => writeSpeedStep(songId, next), [songId]);

  // Смена песни или выключение движка сбрасывает проигрывание (§8): у новой песни своё
  // «стоп сверху», прежнее playing тянуть нельзя. Правим состояние прямо в рендере по
  // предыдущему значению (рекомендация React), а не эффектом с setState.
  const [tracked, setTracked] = useState({ songId, enabled });
  if (tracked.songId !== songId || tracked.enabled !== enabled) {
    setTracked({ songId, enabled });
    setPlaying(false);
    setSuspended(false);
  }

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Значения, которые читает rAF-цикл, держим в ref: их изменение не должно перезапускать
  // цикл (иначе смена ступени/шапки рвала бы разгон и аккумулятор дробных пикселей).
  const stepRef = useRef(step);
  const reducedMotionRef = useRef(reducedMotion);
  const onBeforeRef = useRef(onBeforeProgrammaticScroll);
  // Читается из колбэка ResizeObserver (см. гистерезис в `measure`), который пересоздавать
  // на каждый старт/стоп не нужно. Объявлен ВЫШЕ эффекта замера — тот полагается на
  // актуальное значение к моменту своего первого синхронного measure().
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);
  useEffect(() => {
    onBeforeRef.current = onBeforeProgrammaticScroll;
  });

  const pause = useCallback(() => {
    setPlaying((prev) => {
      if (prev) debug('pause');
      return false;
    });
    setSuspended(false);
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    const container = containerRef.current;
    // На короткой песне скроллить нечего — no-op (FAB Task 4 тоже прячется по canScroll).
    if (!container || container.scrollHeight <= container.clientHeight) return;
    debug('play', { step: stepRef.current });
    setSuspended(false);
    setPlaying(true);
  }, [enabled, containerRef]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  // canScroll — реактивно: контент/шрифт/плотность меняют scrollHeight. Первый замер —
  // синхронно (initial-нотификация ResizeObserver в этом окружении не гарантирована), дальше
  // ResizeObserver на контейнере и потоке ловит смену размера вьюпорта и перевёрстку текста.
  // setState вынесен в функцию `measure`, а не вызывается идентификатором в теле эффекта.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;
    const measure = () => {
      const measured = container.scrollHeight > container.clientHeight;
      debug('canScroll', { measured, playing: playingRef.current });
      // Гистерезис: пока играем, замер только подтверждает, но не снимает canScroll.
      // Вьюпорт во время проигрывания может вырасти сам по себе — на мобильных это
      // схлопывание адресной строки при скролле вниз. На песне, которая скроллилась
      // почти впритык, выросший clientHeight даёт false → FAB уходит из DOM →
      // playing=false → вьюпорт возвращается → FAB возвращается. Мигание.
      // Причина false здесь — выросший вьюпорт, а не «контента не стало»; остановкой
      // по-прежнему владеет только rAF-стоп у низа (§8).
      if (!measured && playingRef.current) return;
      setCanScrollMeasured(measured);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const flow = container.querySelector('[data-song-view-flow]');
    if (flow) observer.observe(flow);
    return () => observer.disconnect();
  }, [containerRef, enabled, songId]);

  // При выключенном движке скроллить нечего по определению — не держим устаревший замер.
  const canScroll = enabled && canScrollMeasured;

  // rAF-цикл живёт только пока playing && enabled. Пере-создаётся на смену этих флагов —
  // тогда локальные аккумуляторы (разгон, дробные пиксели) стартуют с чистого листа.
  useEffect(() => {
    if (!playing || !enabled || suspended) return;
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    let lastTs: number | null = null;
    let startTs = 0;
    let fractional = 0;

    const frame = (ts: number) => {
      const node = containerRef.current;
      if (!node) return; // контейнер исчез — цикл не перезапланируем, cleanup снимет слушатели.

      if (lastTs === null) {
        // Первый кадр: только зафиксировать точку отсчёта, без сдвига (иначе dt огромный).
        lastTs = ts;
        startTs = ts;
        rafId = requestAnimationFrame(frame);
        return;
      }

      const deltaSeconds = (ts - lastTs) / 1000;
      lastTs = ts;

      const lineHeightPx = resolveLineHeightPx(node);
      const targetSpeed = pixelsPerSecond(AUTOSCROLL_STEPS[stepRef.current], lineHeightPx);
      // Разгон ease-in первые ACCELERATION_MS; reduced-motion стартует сразу на целевой (§11).
      const elapsed = ts - startTs;
      const speed = !reducedMotionRef.current && elapsed < ACCELERATION_MS ? targetSpeed * (elapsed / ACCELERATION_MS) : targetSpeed;

      fractional += speed * deltaSeconds;
      const wholePixels = Math.floor(fractional);
      if (wholePixels > 0) {
        fractional -= wholePixels;
        onBeforeRef.current?.();
        node.scrollTop += wholePixels;
      }

      // Стоп у низа: не зацикливать, не откатывать (§8).
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - BOTTOM_EPSILON_PX) {
        debug('reached bottom');
        setPlaying(false);
        return;
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [playing, enabled, suspended, containerRef]);

  // Ручной скролл: приостановка на время жеста вместо выключения (§8). passive — не мешаем
  // нативному скроллу. Возобновление — само, как только прокрутка затихла.
  useEffect(() => {
    if (!playing || !enabled) return;
    const container = containerRef.current;
    if (!container) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastScrollTop = container.scrollTop;

    // Инерция после свайпа катится дольше RESUME_DELAY_MS и произвольно долго: поехать
    // навстречу ей — рывок. Поэтому возобновляем не по таймеру, а когда scrollTop
    // перестал меняться между проверками.
    const resumeWhenSettled = () => {
      const node = containerRef.current;
      if (!node) return;
      if (node.scrollTop !== lastScrollTop) {
        lastScrollTop = node.scrollTop;
        timer = setTimeout(resumeWhenSettled, SETTLE_POLL_MS);
        return;
      }
      debug('resume after manual scroll');
      setSuspended(false);
    };

    const scheduleResume = () => {
      clearTimeout(timer);
      lastScrollTop = containerRef.current?.scrollTop ?? lastScrollTop;
      timer = setTimeout(resumeWhenSettled, RESUME_DELAY_MS);
    };

    const suspend = () => {
      clearTimeout(timer);
      debug('suspend (manual scroll)');
      setSuspended(true);
    };

    // Палец на экране — держим паузу без таймера: отсчёт стартует только с отпусканием.
    const onTouchStart = () => suspend();
    const onTouchEnd = () => scheduleResume();
    const onWheel = () => {
      suspend();
      scheduleResume();
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });
    container.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      clearTimeout(timer);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      container.removeEventListener('wheel', onWheel);
    };
  }, [playing, enabled, containerRef]);

  return { playing, suspended, canScroll, step, setStep, toggle, play, pause };
}
