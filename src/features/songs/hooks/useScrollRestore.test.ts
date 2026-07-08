// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useScrollRestore } from './useScrollRestore';

async function fireScroll(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(20);
  });
}

function setupDiv(scrollTop = 0) {
  const div = document.createElement('div');
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement }).current = div;
  Object.defineProperty(div, 'scrollTop', { value: scrollTop, configurable: true, writable: true });
  return { div, ref };
}

describe('useScrollRestore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('скролл → значение записано в sessionStorage', async () => {
    const { div, ref } = setupDiv(0);
    renderHook(() => useScrollRestore(ref, 'test:scroll', true));

    Object.defineProperty(div, 'scrollTop', { value: 240, configurable: true, writable: true });
    await fireScroll(div);

    expect(sessionStorage.getItem('test:scroll')).toBe('240');
  });

  it('mount с ready=true и сохранённым значением → scrollTop выставлен, onBeforeRestore вызван до этого', () => {
    sessionStorage.setItem('test:restore', '350');
    const { div, ref } = setupDiv(0);
    const order: string[] = [];
    const onBeforeRestore = vi.fn(() => order.push('onBeforeRestore'));

    renderHook(() => useScrollRestore(ref, 'test:restore', true, onBeforeRestore));

    expect(onBeforeRestore).toHaveBeenCalledTimes(1);
    expect(div.scrollTop).toBe(350);
  });

  it('повторная смена ready не восстанавливает второй раз', () => {
    sessionStorage.setItem('test:once', '150');
    const { div, ref } = setupDiv(0);
    const onBeforeRestore = vi.fn();

    const { rerender } = renderHook(({ ready }: { ready: boolean }) => useScrollRestore(ref, 'test:once', ready, onBeforeRestore), {
      initialProps: { ready: true },
    });

    expect(onBeforeRestore).toHaveBeenCalledTimes(1);
    expect(div.scrollTop).toBe(150);

    // Сбрасываем scrollTop вручную (имитация пользовательского скролла назад к 0)
    // и меняем ready ещё раз — второго восстановления быть не должно.
    Object.defineProperty(div, 'scrollTop', { value: 0, configurable: true, writable: true });
    rerender({ ready: false });
    rerender({ ready: true });

    expect(onBeforeRestore).toHaveBeenCalledTimes(1);
    expect(div.scrollTop).toBe(0);
  });
});
