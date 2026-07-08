// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useAutoHideOnScroll } from './useAutoHideOnScroll';

function mockScrollMetrics(el: HTMLElement, { scrollTop, scrollHeight, clientHeight }: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}) {
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true, writable: true });
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

async function fireScroll(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new Event('scroll'));
    // scheduleFrame фолбэк на setTimeout(cb, 16) в jsdom (нет requestAnimationFrame).
    await vi.advanceTimersByTimeAsync(20);
  });
}

function setup(scrollTop = 0, contentReady: unknown = 1) {
  const div = document.createElement('div');
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement }).current = div;
  mockScrollMetrics(div, { scrollTop, scrollHeight: 2000, clientHeight: 800 });
  const utils = renderHook(({ ready }: { ready: unknown }) => useAutoHideOnScroll(ref, ready), {
    initialProps: { ready: contentReady },
  });
  return { div, ...utils };
}

describe('useAutoHideOnScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('скролл вниз → hidden=true', async () => {
    const { div, result } = setup(100);
    expect(result.current.hidden).toBe(false);

    mockScrollMetrics(div, { scrollTop: 150, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);

    expect(result.current.hidden).toBe(true);
  });

  it('скролл вверх после hidden → hidden=false', async () => {
    const { div, result } = setup(200);

    mockScrollMetrics(div, { scrollTop: 300, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    mockScrollMetrics(div, { scrollTop: 150, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(false);
  });

  it('нескроллируемый контент при смене contentReady → hidden=false', async () => {
    const { div, result, rerender } = setup(100, 1);

    mockScrollMetrics(div, { scrollTop: 150, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    // Контент перерендерился и стал короче — не скроллится (scrollHeight <= clientHeight).
    mockScrollMetrics(div, { scrollTop: 0, scrollHeight: 500, clientHeight: 800 });
    await act(async () => {
      rerender({ ready: 2 });
    });

    expect(result.current.hidden).toBe(false);
  });
});
