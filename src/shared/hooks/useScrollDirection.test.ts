// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useScrollDirection } from './useScrollDirection';

function mockScrollMetrics(el: HTMLElement, { scrollTop, scrollHeight, clientHeight }: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}) {
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
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

describe('useScrollDirection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('скролл вниз больше threshold → hidden', async () => {
    const div = document.createElement('div');
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = div;
    mockScrollMetrics(div, { scrollTop: 0, scrollHeight: 2000, clientHeight: 800 });

    const { result } = renderHook(() => useScrollDirection(ref));
    expect(result.current).toBe(false);

    mockScrollMetrics(div, { scrollTop: 100, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);

    expect(result.current).toBe(true);
  });

  it('скролл вверх после hidden → visible', async () => {
    const div = document.createElement('div');
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = div;
    mockScrollMetrics(div, { scrollTop: 200, scrollHeight: 2000, clientHeight: 800 });

    const { result } = renderHook(() => useScrollDirection(ref));

    mockScrollMetrics(div, { scrollTop: 300, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current).toBe(true);

    mockScrollMetrics(div, { scrollTop: 150, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current).toBe(false);
  });

  it('scrollTop у верха (< topThreshold) → всегда visible', async () => {
    const div = document.createElement('div');
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = div;
    mockScrollMetrics(div, { scrollTop: 200, scrollHeight: 2000, clientHeight: 800 });

    const { result } = renderHook(() => useScrollDirection(ref));

    mockScrollMetrics(div, { scrollTop: 300, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current).toBe(true);

    mockScrollMetrics(div, { scrollTop: 10, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current).toBe(false);
  });

  it('overscroll за пределами [0, maxScrollTop] (iOS bounce) не меняет состояние', async () => {
    const div = document.createElement('div');
    const ref = createRef<HTMLDivElement>();
    const maxScrollTop = 2000 - 800;
    (ref as { current: HTMLDivElement }).current = div;
    mockScrollMetrics(div, { scrollTop: 100, scrollHeight: 2000, clientHeight: 800 });

    const { result } = renderHook(() => useScrollDirection(ref));

    // Довести до hidden обычным скроллом вниз (к концу главы).
    mockScrollMetrics(div, { scrollTop: maxScrollTop, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current).toBe(true);

    // Bounce за maxScrollTop (низ главы) — должен игнорироваться, остаёмся hidden.
    mockScrollMetrics(div, { scrollTop: maxScrollTop + 50, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current).toBe(true);

    // Отрицательный overscroll (bounce наверху) — тоже игнорируется.
    mockScrollMetrics(div, { scrollTop: -30, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current).toBe(true);
  });
});
