'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Жест «потянуть вниз → обновить» для скролл-контейнера.
 *
 * Механика по образцу `SwipePager`: ось решается порогом, отклик резиновый, а живое
 * смещение уезжает в CSS-переменные — стейт меняется ТОЛЬКО на сменах фазы, иначе
 * каждый `pointermove` перерисовывал бы весь список.
 */

/** Потолок протягивания: палец может уехать дальше, индикатор асимптотически упирается сюда. */
export const MAX_PULL_PX = 96;
/** Порог взвода: отпустил дальше — обновляем. */
export const TRIGGER_PX = 64;
/** До этой дистанции ось жеста не считается решённой (как AXIS_LOCK_PX в SwipePager). */
const AXIS_LOCK_PX = 8;
/** Минимальная видимость спиннера: без неё быстрый ответ сервера даёт мигание. */
const MIN_SPIN_MS = 500;

/**
 * Обе переменные пишет хук, обе читает индикатор. Одной px-мало: без прогресса
 * индикатор не посчитает scale/opacity, не зная `MAX_PULL_PX`, и константа
 * продублируется — ровно тот рассинхрон писателя и читателя, на котором проект
 * уже горел с ключами кэша.
 */
export const PULL_VAR = '--ptr-pull';
export const PROGRESS_VAR = '--ptr-progress';

export type PullToRefreshPhase = 'idle' | 'pulling' | 'armed' | 'refreshing';

/** Резиновый отклик: растёт монотонно и упирается в `MAX_PULL_PX`. */
export function pullForDelta(dy: number): number {
  if (dy <= 0) return 0;
  return (MAX_PULL_PX * dy) / (dy + MAX_PULL_PX);
}

/** 0…1 — насколько жест дошёл до порога взвода. */
export function progressForPull(pull: number): number {
  return Math.min(1, pull / TRIGGER_PX);
}

type Axis = 'undecided' | 'vertical' | 'ignored';

export interface UsePullToRefreshOptions {
  /** false — жест выключен, обработчики пустые. */
  enabled?: boolean;
  /** Должен резолвиться в любом исходе: реджект тоже вернёт фазу в idle, но это не его работа. */
  onRefresh: () => void | Promise<void>;
}

export function usePullToRefresh({ enabled = true, onRefresh }: UsePullToRefreshOptions) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const axisRef = useRef<Axis>('undecided');
  const pullRef = useRef(0);
  const activeRef = useRef(true);
  const capturedRef = useRef<number | null>(null);
  /** Жест был вертикальным ⇒ ближайший click — ghost, гасим его. */
  const suppressClickRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  const [phase, setPhase] = useState<PullToRefreshPhase>('idle');
  const phaseRef = useRef<PullToRefreshPhase>('idle');

  // Ref-паттерн: обработчики жеста стабильны, а вызывают всегда свежий onRefresh.
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const setPhaseSafely = useCallback((next: PullToRefreshPhase) => {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    if (activeRef.current) setPhase(next);
  }, []);

  const writeVars = useCallback((pull: number) => {
    pullRef.current = pull;
    const node = scrollRef.current;
    if (!node) return;
    node.style.setProperty(PULL_VAR, `${pull}px`);
    node.style.setProperty(PROGRESS_VAR, String(progressForPull(pull)));
  }, []);

  const releaseCapture = useCallback(() => {
    const pointerId = capturedRef.current;
    capturedRef.current = null;
    if (pointerId === null) return;
    try {
      scrollRef.current?.releasePointerCapture(pointerId);
    } catch {
      // Указатель уже отпущен браузером — освобождать нечего.
    }
  }, []);

  const resetGesture = useCallback(() => {
    startRef.current = null;
    axisRef.current = 'undecided';
    releaseCapture();
    writeVars(0);
  }, [releaseCapture, writeVars]);

  const handlers = !enabled
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent) => {
          suppressClickRef.current = false;
          if (phaseRef.current === 'refreshing') return;
          // Тянуть можно только от самого верха. `<= 0`, а не `=== 0`: iOS elastic
          // bounce даёт отрицательный scrollTop.
          const node = scrollRef.current;
          if (!node || node.scrollTop > 0) return;
          startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
          axisRef.current = 'undecided';
        },

        onPointerMove: (e: React.PointerEvent) => {
          const start = startRef.current;
          if (!start || axisRef.current === 'ignored') return;

          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;

          if (axisRef.current === 'undecided') {
            if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
            const isVerticalPull = dy > 0 && Math.abs(dy) > 1.5 * Math.abs(dx);
            if (!isVerticalPull) {
              // Обычный скролл или горизонталь — не наше дело до конца жеста.
              axisRef.current = 'ignored';
              return;
            }
            axisRef.current = 'vertical';
            suppressClickRef.current = true;
            // За 8px до опознания оси мышь успевает начать выделение текста —
            // `user-select: none` его уже не снимет, снимаем руками.
            if (typeof window !== 'undefined') window.getSelection?.()?.removeAllRanges();
            // Захват ставим ЗДЕСЬ, а не в pointerdown: палец тянет от верхнего края и
            // легко уходит за пределы вьюпорта — без захвата pointerup теряется и фаза
            // залипает в pulling. Раньше нельзя: захват уводит click с карточки на
            // контейнер и ломает обычный тап.
            try {
              scrollRef.current?.setPointerCapture(start.pointerId);
              capturedRef.current = start.pointerId;
            } catch {
              // jsdom и старые браузеры — работаем без захвата.
            }
          }

          const pull = pullForDelta(dy);
          writeVars(pull);
          setPhaseSafely(pull >= TRIGGER_PX ? 'armed' : 'pulling');
        },

        onPointerUp: () => {
          const wasVertical = axisRef.current === 'vertical';
          const pull = pullRef.current;
          resetGesture();

          if (!wasVertical || pull < TRIGGER_PX) {
            if (wasVertical) console.debug('[usePullToRefresh] cancel', { pullPx: pull });
            setPhaseSafely('idle');
            return;
          }

          console.debug('[usePullToRefresh] commit', { pullPx: pull });
          setPhaseSafely('refreshing');
          // Индикатор во время запроса стоит на высоте покоя, а не там, где отпустили.
          writeVars(TRIGGER_PX);

          void (async () => {
            const startedAt = Date.now();
            try {
              await onRefreshRef.current();
            } catch (err) {
              // onRefresh обязан обрабатывать свои ошибки сам; наша задача — не залипнуть.
              console.warn('[usePullToRefresh] onRefresh rejected', err);
            } finally {
              const elapsed = Date.now() - startedAt;
              if (elapsed < MIN_SPIN_MS) {
                await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
              }
              writeVars(0);
              setPhaseSafely('idle');
            }
          })();
        },

        onPointerCancel: () => {
          const wasVertical = axisRef.current === 'vertical';
          resetGesture();
          if (phaseRef.current !== 'refreshing') setPhaseSafely('idle');
          if (wasVertical) console.debug('[usePullToRefresh] cancel (pointercancel)');
        },

        onClickCapture: (e: React.MouseEvent) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          e.stopPropagation();
          e.preventDefault();
          console.debug('[usePullToRefresh] click suppressed');
        },
      };

  return { scrollRef, handlers, phase };
}
