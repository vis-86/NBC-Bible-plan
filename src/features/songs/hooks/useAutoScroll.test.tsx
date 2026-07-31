// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useAutoScroll } from './useAutoScroll';

/**
 * Гистерезис `canScroll`: пока идёт проигрывание, замер подтверждает флаг, но не
 * снимает его. Вьюпорт во время проигрывания растёт сам (схлопывание адресной строки
 * мобильного браузера), и на песне, которая скроллилась почти впритык, честный замер
 * убрал бы FAB из DOM — вьюпорт вернулся бы, FAB тоже (мигание).
 */

/** Захваченные колбэки ResizeObserver — ими прогоняем повторный замер вручную. */
let observerCallbacks: Array<() => void> = [];

beforeEach(() => {
  observerCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(cb: () => void) {
      observerCallbacks.push(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;

  // rAF-цикл в этих кейсах не нужен: проверяется только реакция на замер.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Контейнер с управляемыми размерами: jsdom не считает layout сам. */
function createContainer(scrollHeight: number, clientHeight: number) {
  const node = document.createElement('div');
  const sizes = { scrollHeight, clientHeight };
  Object.defineProperty(node, 'scrollHeight', { get: () => sizes.scrollHeight });
  Object.defineProperty(node, 'clientHeight', { get: () => sizes.clientHeight });
  document.body.appendChild(node);
  return { node, sizes };
}

function renderAutoScroll(node: HTMLElement) {
  return renderHook(() => {
    const containerRef = useRef<HTMLElement | null>(node);
    return useAutoScroll({ containerRef, songId: '1', enabled: true });
  });
}

function remeasure() {
  act(() => {
    observerCallbacks.forEach((cb) => cb());
  });
}

describe('useAutoScroll — гистерезис canScroll', () => {
  it('во время проигрывания выросший clientHeight не сбрасывает canScroll', () => {
    const { node, sizes } = createContainer(1000, 500);
    const { result } = renderAutoScroll(node);
    expect(result.current.canScroll).toBe(true);

    act(() => result.current.play());
    expect(result.current.playing).toBe(true);

    // Адресная строка схлопнулась: вьюпорт вырос ровно до высоты контента.
    sizes.clientHeight = 1000;
    remeasure();

    expect(result.current.canScroll).toBe(true);
    expect(result.current.playing).toBe(true);
  });

  it('на паузе тот же замер честно снимает canScroll', () => {
    const { node, sizes } = createContainer(1000, 500);
    const { result } = renderAutoScroll(node);
    expect(result.current.canScroll).toBe(true);

    sizes.clientHeight = 1000;
    remeasure();

    expect(result.current.canScroll).toBe(false);
  });

  it('после паузы замер снова снимает canScroll', () => {
    const { node, sizes } = createContainer(1000, 500);
    const { result } = renderAutoScroll(node);

    act(() => result.current.play());
    sizes.clientHeight = 1000;
    remeasure();
    expect(result.current.canScroll).toBe(true);

    act(() => result.current.pause());
    remeasure();
    expect(result.current.canScroll).toBe(false);
  });
});
