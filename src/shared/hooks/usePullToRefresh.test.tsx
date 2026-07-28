// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PULL_PX, TRIGGER_PX, progressForPull, pullForDelta, usePullToRefresh } from './usePullToRefresh';

/** Резинка: чтобы pull дошёл до TRIGGER_PX=64 при MAX_PULL_PX=96, нужно dy >= 192. */
const COMMIT_DY = 250;
const SHORT_DY = 40;

function Harness({
  onRefresh,
  onCardClick,
  enabled = true,
  scrollTop = 0,
}: {
  onRefresh: () => void | Promise<void>;
  onCardClick?: () => void;
  enabled?: boolean;
  scrollTop?: number;
}) {
  const { scrollRef, handlers, phase } = usePullToRefresh({ enabled, onRefresh });
  return (
    <div
      ref={(node) => {
        scrollRef.current = node;
        if (node) Object.defineProperty(node, 'scrollTop', { value: scrollTop, configurable: true });
      }}
      data-testid="container"
      data-phase={phase}
      {...handlers}
    >
      <button type="button" onClick={onCardClick}>
        карточка
      </button>
    </div>
  );
}

function container() {
  return screen.getByTestId('container');
}

function pull(el: Element, dy: number, dx = 0, { release = true } = {}) {
  fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1 });
  // Серия шагов: ось решается порогом 8px, одним движением жест не читается корректно.
  for (const step of [0.2, 0.6, 1]) {
    fireEvent.pointerMove(el, { clientX: 100 + dx * step, clientY: 100 + dy * step, pointerId: 1 });
  }
  if (release) fireEvent.pointerUp(el, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 });
}

describe('usePullToRefresh', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // В jsdom нет pointer capture.
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('формулы: резинка упирается в MAX_PULL_PX, прогресс не превышает 1', () => {
    expect(pullForDelta(0)).toBe(0);
    expect(pullForDelta(-50)).toBe(0);
    expect(pullForDelta(10_000)).toBeLessThan(MAX_PULL_PX);
    expect(pullForDelta(COMMIT_DY)).toBeGreaterThanOrEqual(TRIGGER_PX);
    expect(progressForPull(TRIGGER_PX * 5)).toBe(1);
  });

  it('протягивание ниже порога -> onRefresh не вызван, фаза вернулась в idle', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    pull(container(), SHORT_DY);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(container()).toHaveAttribute('data-phase', 'idle');
  });

  it('протягивание выше порога -> onRefresh ровно один раз, фаза refreshing до резолва', async () => {
    let release: () => void = () => {};
    const onRefresh = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<Harness onRefresh={onRefresh} />);
    pull(container(), COMMIT_DY);

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(container()).toHaveAttribute('data-phase', 'refreshing');

    release();
    await waitFor(() => expect(container()).toHaveAttribute('data-phase', 'idle'), { timeout: 2000 });
  });

  it('порог взвода: перед отпусканием фаза armed', () => {
    render(<Harness onRefresh={vi.fn()} />);
    pull(container(), COMMIT_DY, 0, { release: false });
    expect(container()).toHaveAttribute('data-phase', 'armed');
  });

  it('старт при scrollTop > 0 -> жест не начинается', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} scrollTop={120} />);
    pull(container(), COMMIT_DY);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(container()).toHaveAttribute('data-phase', 'idle');
  });

  it('преимущественно горизонтальное движение -> жест не начинается', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    pull(container(), COMMIT_DY, COMMIT_DY);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(container()).toHaveAttribute('data-phase', 'idle');
  });

  it('onRefresh реджектится -> фаза всё равно возвращается в idle (спиннер не залипает)', async () => {
    const onRefresh = vi.fn(() => Promise.reject(new Error('Нет сети')));
    render(<Harness onRefresh={onRefresh} />);
    pull(container(), COMMIT_DY);

    expect(onRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(container()).toHaveAttribute('data-phase', 'idle'), { timeout: 2000 });
  });

  it('pointercancel в середине -> onRefresh не вызван, фаза idle', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    pull(container(), COMMIT_DY, 0, { release: false });
    fireEvent.pointerCancel(container(), { pointerId: 1 });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(container()).toHaveAttribute('data-phase', 'idle');
  });

  it('ghost-click: клик после вертикального жеста подавлен, следующий обычный проходит', () => {
    const onCardClick = vi.fn();
    render(<Harness onRefresh={vi.fn()} onCardClick={onCardClick} />);
    const button = screen.getByRole('button');

    pull(container(), SHORT_DY);
    fireEvent.click(button);
    expect(onCardClick).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('pointerup вне элемента (pointer capture) -> фаза завершается, не залипает в pulling', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    const el = container();

    fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1 });
    for (const step of [0.2, 0.6, 1]) {
      fireEvent.pointerMove(el, { clientX: 100, clientY: 100 + SHORT_DY * step, pointerId: 1 });
    }
    expect(el).toHaveAttribute('data-phase', 'pulling');
    // Захват перенаправляет события на контейнер, даже если палец ушёл за вьюпорт.
    expect(Element.prototype.setPointerCapture).toHaveBeenCalledWith(1);

    fireEvent.pointerUp(el, { clientX: 100, clientY: 9999, pointerId: 1 });
    expect(el).toHaveAttribute('data-phase', 'idle');
  });

  it('enabled=false -> обработчиков нет, жест мёртв', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} enabled={false} />);
    pull(container(), COMMIT_DY);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(container()).toHaveAttribute('data-phase', 'idle');
  });
});
