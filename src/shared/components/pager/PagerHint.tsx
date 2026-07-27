'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PagerHintProps {
  visible: boolean;
  /** 0-based индекс позиции, которую показываем. */
  index: number;
  total: number;
  /** Подпись под цифрой. Пустая строка ⇒ строка подписи не рендерится вовсе. */
  label: string;
  atEdge: boolean;
}

export interface PagerHintState {
  visible: boolean;
  index: number;
  label: string;
  atEdge: boolean;
}

export interface UsePagerHintApi {
  state: PagerHintState;
  /** Показать и держать (жест идёт). */
  show: (index: number, label: string, atEdge: boolean) => void;
  /** Показать и погасить через ms. */
  showAndHide: (index: number, label: string, atEdge: boolean, ms: number) => void;
  hide: () => void;
}

const INITIAL_STATE: PagerHintState = { visible: false, index: 0, label: '', atEdge: false };

export function usePagerHint(): UsePagerHintApi {
  const [state, setState] = useState<PagerHintState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = useCallback((index: number, label: string, atEdge: boolean) => {
    clearTimer();
    setState({ visible: true, index, label, atEdge });
  }, []);

  const showAndHide = useCallback((index: number, label: string, atEdge: boolean, ms: number) => {
    clearTimer();
    setState({ visible: true, index, label, atEdge });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setState((prev) => ({ ...prev, visible: false }));
    }, ms);
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  return { state, show, showAndHide, hide };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function PagerHint({ visible, index, total, label, atEdge }: PagerHintProps) {
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
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-black/70 px-5 py-3 text-center text-white backdrop-blur-md transition-[opacity,transform] duration-200"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translate(-50%, -50%) scale(${reducedMotion ? 1 : visible ? 1 : 0.92})`,
        transitionDuration: reducedMotion ? '160ms' : '160ms, 220ms',
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
