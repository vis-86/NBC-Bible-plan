'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PagerHintProps {
  /**
   * «Держать полностью видимой» — вспышка после перехода. Во время жеста false:
   * непрозрачность берётся из `--swipe-progress` (SwipePager), то есть подсказка
   * проявляется по мере ухода пальца и тает по мере возврата.
   */
  visible: boolean;
  /**
   * Жест идёт: непрозрачностью управляет `--swipe-progress`, поэтому переходы
   * выключены (иначе подсказка отстаёт от пальца на длительность transition).
   */
  dragging?: boolean;
  /** 0-based индекс позиции, которую показываем. */
  index: number;
  total: number;
  /** Подпись под цифрой. Пустая строка ⇒ строка подписи не рендерится вовсе. */
  label: string;
  atEdge: boolean;
}

export interface PagerHintState {
  visible: boolean;
  /** Содержимое обновляется жестом — видимостью управляет `--swipe-progress`. */
  dragging: boolean;
  index: number;
  label: string;
  atEdge: boolean;
}

export interface UsePagerHintApi {
  state: PagerHintState;
  /**
   * Обновить СОДЕРЖИМОЕ подсказки на время жеста, не форсируя видимость: показывать её
   * или нет, решает прогресс жеста (`--swipe-progress`). Держать `visible` во время
   * drag'а нельзя — подсказка вспыхивала бы на первых же 8px и не таяла при возврате.
   */
  track: (index: number, label: string, atEdge: boolean) => void;
  /** Показать и погасить через ms — вспышка после состоявшегося перехода. */
  showAndHide: (index: number, label: string, atEdge: boolean, ms: number) => void;
}

const INITIAL_STATE: PagerHintState = { visible: false, dragging: false, index: 0, label: '', atEdge: false };

export function usePagerHint(): UsePagerHintApi {
  const [state, setState] = useState<PagerHintState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const track = useCallback((index: number, label: string, atEdge: boolean) => {
    clearTimer();
    setState((prev) =>
      prev.dragging && !prev.visible && prev.index === index && prev.label === label && prev.atEdge === atEdge
        ? prev
        : { visible: false, dragging: true, index, label, atEdge },
    );
  }, []);

  const showAndHide = useCallback((index: number, label: string, atEdge: boolean, ms: number) => {
    clearTimer();
    setState({ visible: true, dragging: false, index, label, atEdge });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setState((prev) => ({ ...prev, visible: false }));
    }, ms);
  }, []);

  // Гасить подсказку отдельным вызовом не нужно: незавершённый жест обнуляет
  // `--swipe-progress` сам (SwipePager), а состояние остаётся «dragging» до
  // следующего жеста или перехода.
  return { state, track, showAndHide };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function PagerHint({ visible, dragging = false, index, total, label, atEdge }: PagerHintProps) {
  const edgeLabel = index < 0 ? 'Это первая' : 'Это последняя';
  const displayLabel = atEdge ? edgeLabel : label;
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    if (visible) console.debug('[PagerHint] show', { index, total, atEdge });
  }, [visible, index, total, atEdge]);

  return (
    <div
      data-pager-hint
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-black/70 px-5 py-3 text-center text-white backdrop-blur-md"
      style={{
        // Во время жеста непрозрачность = прогресс: подсказка проявляется, пока палец
        // уходит, и тает, пока страница возвращается (SwipePager гасит переменную).
        // Переход анимируем только у вспышки после коммита — иначе подсказка отставала
        // бы от пальца на длительность transition.
        opacity: visible ? 1 : `var(--swipe-progress, 0)`,
        transitionProperty: 'opacity, scale',
        transitionTimingFunction: 'ease-out',
        // Tailwind v4 центрирует через CSS-свойство `translate`, а не `transform`:
        // собственный transform:translate(-50%,-50%) НЕ перебил бы его, а сложился с ним —
        // хинт уезжал бы влево-вверх на половину своего размера. Масштаб задаём
        // отдельным свойством `scale`, чтобы transform на этом узле не появлялся вовсе.
        scale: reducedMotion || visible || dragging ? '1' : '0.92',
        transitionDuration: dragging ? '0ms' : reducedMotion ? '160ms' : '160ms, 220ms',
      }}
    >
      <div data-pager-hint-position className="text-2xl font-semibold tabular-nums">
        {index + 1} из {total}
      </div>
      {displayLabel !== '' ? (
        <div data-pager-hint-label className="mt-0.5 text-sm text-white/80">
          {displayLabel}
        </div>
      ) : null}
    </div>
  );
}
