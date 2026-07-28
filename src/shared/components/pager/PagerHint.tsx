'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

/**
 * Куда ведёт текущий жест. Отдельный тип, потому что край краю рознь: «идти некуда»
 * (`atEdge`) и «дальше терминальное действие» (`action: 'end'`) — разные исходы, и
 * решает это вызывающий экран, а не пейджер (`SwipePager.atEdge` считает `onEnd`
 * отсутствием края).
 */
export interface PagerHintTarget {
  /** 0-based индекс позиции, которую показываем. */
  index: number;
  /** Подпись под цифрой. Пустая строка ⇒ строка подписи не рендерится вовсе. */
  label: string;
  /** Идти некуда: без `action` подсказка не показывается вовсе (мёртвый край). */
  atEdge: boolean;
  /** Терминальное действие вместо перехода: `'end'` → ✓ «Завершить». */
  action?: 'end';
}

export interface PagerHintProps extends PagerHintTarget {
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
  total: number;
}

export interface PagerHintState extends PagerHintTarget {
  visible: boolean;
  /** Содержимое обновляется жестом — видимостью управляет `--swipe-progress`. */
  dragging: boolean;
}

export interface UsePagerHintApi {
  state: PagerHintState;
  /**
   * Обновить СОДЕРЖИМОЕ подсказки на время жеста, не форсируя видимость: показывать её
   * или нет, решает прогресс жеста (`--swipe-progress`). Держать `visible` во время
   * drag'а нельзя — подсказка вспыхивала бы на первых же 8px и не таяла при возврате.
   */
  track: (target: PagerHintTarget) => void;
  /** Показать и погасить через ms — вспышка после состоявшегося перехода. */
  showAndHide: (target: PagerHintTarget, ms: number) => void;
}

const INITIAL_STATE: PagerHintState = { visible: false, dragging: false, index: 0, label: '', atEdge: false };

function sameTarget(a: PagerHintTarget, b: PagerHintTarget): boolean {
  return a.index === b.index && a.label === b.label && a.atEdge === b.atEdge && a.action === b.action;
}

export function usePagerHint(): UsePagerHintApi {
  const [state, setState] = useState<PagerHintState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const track = useCallback((target: PagerHintTarget) => {
    clearTimer();
    setState((prev) =>
      prev.dragging && !prev.visible && sameTarget(prev, target)
        ? prev
        : { ...target, visible: false, dragging: true },
    );
  }, []);

  const showAndHide = useCallback((target: PagerHintTarget, ms: number) => {
    clearTimer();
    setState({ ...target, visible: true, dragging: false });
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

export function PagerHint({ visible, dragging = false, index, total, label, atEdge, action }: PagerHintProps) {
  const reducedMotion = prefersReducedMotion();
  /**
   * Мёртвый край — идти некуда и терминального действия нет: подсказки нет вовсе.
   * Обещать «Это последняя» бессмысленно, а обещать переход — вредно.
   */
  const isDeadEdge = atEdge && !action;

  useEffect(() => {
    if (visible) console.debug('[PagerHint] show', { index, total, atEdge, action });
  }, [visible, index, total, atEdge, action]);

  if (isDeadEdge) return null;

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
      {action === 'end' ? (
        // Терминальное действие: считать «N из M» нечего — свайп не листает, а завершает.
        <div data-pager-hint-action className="flex flex-col items-center gap-1">
          <Check size={28} aria-hidden />
          <div className="text-sm text-white/80">Завершить</div>
        </div>
      ) : (
        <>
          <div data-pager-hint-position className="text-2xl font-semibold tabular-nums">
            {index + 1} из {total}
          </div>
          {label !== '' ? (
            <div data-pager-hint-label className="mt-0.5 text-sm text-white/80">
              {label}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
