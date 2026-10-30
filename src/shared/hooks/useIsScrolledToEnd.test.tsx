// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIsScrolledToEnd } from './useIsScrolledToEnd';

function scroller({ scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true, configurable: true });
  return el;
}

describe('useIsScrolledToEnd', () => {
  it('false в начале длинного листа, true у низа (с допуском)', () => {
    const el = scroller({ scrollHeight: 2000, clientHeight: 800 });
    const { result } = renderHook(() => useIsScrolledToEnd({ current: el }, { thresholdPx: 24 }));
    expect(result.current).toBe(false);

    act(() => {
      el.scrollTop = 1180;
      el.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(true);

    act(() => {
      el.scrollTop = 500;
      el.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(false);
  });

  it('контейнер без прокрутки считается долистанным', () => {
    const el = scroller({ scrollHeight: 600, clientHeight: 800 });
    const { result } = renderHook(() => useIsScrolledToEnd({ current: el }));
    expect(result.current).toBe(true);
  });
});
