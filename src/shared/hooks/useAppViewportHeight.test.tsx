// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppViewportHeight, APP_VIEWPORT_HEIGHT_VAR } from './useAppViewportHeight';

function readVar() {
  return document.documentElement.style.getPropertyValue(APP_VIEWPORT_HEIGHT_VAR);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.style.removeProperty(APP_VIEWPORT_HEIGHT_VAR);
  document.head.querySelectorAll('meta[name="viewport"]').forEach((el) => el.remove());
  vi.unstubAllGlobals();
});

describe('useAppViewportHeight', () => {
  it('пишет измеренную высоту вьюпорта в --app-vh', () => {
    vi.stubGlobal('visualViewport', undefined);
    window.innerHeight = 812;

    renderHook(() => useAppViewportHeight());

    expect(readVar()).toBe('812px');
  });

  it('предпочитает visualViewport.height (layout viewport на iOS врёт после поворота)', () => {
    vi.stubGlobal('visualViewport', {
      height: 700,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    window.innerHeight = 812;

    renderHook(() => useAppViewportHeight());

    expect(readVar()).toBe('700px');
  });

  it('дочитывает высоту после поворота: первый замер ещё ландшафтный, финальный приходит позже', () => {
    vi.stubGlobal('visualViewport', undefined);
    window.innerHeight = 390;

    renderHook(() => useAppViewportHeight());
    expect(readVar()).toBe('390px');

    // WebKit шлёт событие, но размеры пока промежуточные — как на реальном повороте.
    act(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });
    expect(readVar()).toBe('390px');

    window.innerHeight = 812;
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(readVar()).toBe('812px');
  });

  it('прекращает опрос, когда размеры устоялись', () => {
    vi.stubGlobal('visualViewport', undefined);
    window.innerHeight = 812;

    renderHook(() => useAppViewportHeight());
    act(() => {
      window.dispatchEvent(new Event('orientationchange'));
      vi.advanceTimersByTime(600);
    });

    // Опрос уже остановлен: позднее изменение без события не подхватывается.
    window.innerHeight = 500;
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(readVar()).toBe('812px');
  });

  it('игнорирует нулевую высоту промежуточного кадра поворота', () => {
    vi.stubGlobal('visualViewport', undefined);
    window.innerHeight = 812;

    renderHook(() => useAppViewportHeight());

    window.innerHeight = 0;
    act(() => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(300);
    });

    expect(readVar()).toBe('812px');
  });

  it('убирает переменную при размонтировании', () => {
    vi.stubGlobal('visualViewport', undefined);
    window.innerHeight = 812;

    const { unmount } = renderHook(() => useAppViewportHeight());
    unmount();

    expect(readVar()).toBe('');
  });
});
