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

function setup(scrollTop = 0, options?: { minScrollTop?: number }) {
  const div = document.createElement('div');
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement }).current = div;
  mockScrollMetrics(div, { scrollTop, scrollHeight: 2000, clientHeight: 800 });
  const utils = renderHook(() => useScrollDirection(ref, options));
  return { div, ...utils };
}

describe('useScrollDirection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('любое движение вниз (дефолтный hideThreshold=0) → hidden сразу', async () => {
    const { div, result } = setup(100);
    expect(result.current.hidden).toBe(false);

    mockScrollMetrics(div, { scrollTop: 103, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);

    expect(result.current.hidden).toBe(true);
  });

  it('скролл вверх больше showThreshold после hidden → visible', async () => {
    const { div, result } = setup(200);

    mockScrollMetrics(div, { scrollTop: 300, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    mockScrollMetrics(div, { scrollTop: 150, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(false);
  });

  it('движение вверх у верха (< topThreshold) → visible даже при малой дельте', async () => {
    const { div, result } = setup(200);

    mockScrollMetrics(div, { scrollTop: 300, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    // Медленно доползли до зоны верха: дельта -5 меньше showThreshold, но зона верха.
    mockScrollMetrics(div, { scrollTop: 20, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    mockScrollMetrics(div, { scrollTop: 15, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(false);
  });

  it('позиция у верха БЕЗ движения вверх не показывает chrome (ignoreNextScroll при смене главы)', async () => {
    const { div, result } = setup(100);

    mockScrollMetrics(div, { scrollTop: 500, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    // Смена главы: программный сброс scrollTop → 0 помечен ignoreNextScroll —
    // chrome остаётся скрытым (нет прыжка экрана).
    act(() => result.current.ignoreNextScroll());
    mockScrollMetrics(div, { scrollTop: 0, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    // Следующий скролл вниз от нуля — обычная обработка, остаёмся hidden.
    mockScrollMetrics(div, { scrollTop: 10, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    // А движение вверх у верха возвращает chrome.
    mockScrollMetrics(div, { scrollTop: 5, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(false);
  });

  it('setHidden управляет состоянием извне (короткая глава без скролла)', async () => {
    const { div, result } = setup(100);

    mockScrollMetrics(div, { scrollTop: 200, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    act(() => result.current.setHidden(false));
    expect(result.current.hidden).toBe(false);
  });

  it('overscroll за пределами [0, maxScrollTop] (iOS bounce) не меняет состояние', async () => {
    const { div, result } = setup(100);
    const maxScrollTop = 2000 - 800;

    // Довести до hidden обычным скроллом вниз (к концу главы).
    mockScrollMetrics(div, { scrollTop: maxScrollTop, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    // Bounce за maxScrollTop (низ главы) — должен игнорироваться, остаёмся hidden.
    mockScrollMetrics(div, { scrollTop: maxScrollTop + 50, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);

    // Отрицательный overscroll (bounce наверху) — тоже игнорируется.
    mockScrollMetrics(div, { scrollTop: -30, scrollHeight: 2000, clientHeight: 800 });
    await fireScroll(div);
    expect(result.current.hidden).toBe(true);
  });

  // Оверлейная шапка: пока лист не уехал под неё, прятать нечего — под шапкой ещё
  // нет контента, и уборка открыла бы пустую полосу.
  describe('minScrollTop', () => {
    it('скролл вниз ДО minScrollTop не прячет chrome', async () => {
      const { div, result } = setup(0, { minScrollTop: 120 });

      mockScrollMetrics(div, { scrollTop: 60, scrollHeight: 2000, clientHeight: 800 });
      await fireScroll(div);
      expect(result.current.hidden).toBe(false);
    });

    it('скролл вниз ПОСЛЕ minScrollTop прячет как обычно', async () => {
      const { div, result } = setup(0, { minScrollTop: 120 });

      mockScrollMetrics(div, { scrollTop: 200, scrollHeight: 2000, clientHeight: 800 });
      await fireScroll(div);
      expect(result.current.hidden).toBe(true);
    });

    it('возврат наверх показывает chrome независимо от minScrollTop', async () => {
      const { div, result } = setup(0, { minScrollTop: 120 });

      mockScrollMetrics(div, { scrollTop: 400, scrollHeight: 2000, clientHeight: 800 });
      await fireScroll(div);
      expect(result.current.hidden).toBe(true);

      mockScrollMetrics(div, { scrollTop: 10, scrollHeight: 2000, clientHeight: 800 });
      await fireScroll(div);
      expect(result.current.hidden).toBe(false);
    });
  });
});
