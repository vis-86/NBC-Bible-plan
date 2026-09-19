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

/** Контейнер с управляемыми размерами: jsdom не считает layout сам (scrollTop там тоже
 *  всегда 0, поэтому он тоже подменяется — на нём держится детекция «прокрутка затихла»). */
function createContainer(scrollHeight: number, clientHeight: number) {
  const node = document.createElement('div');
  const sizes = { scrollHeight, clientHeight, scrollTop: 0 };
  Object.defineProperty(node, 'scrollHeight', { get: () => sizes.scrollHeight });
  Object.defineProperty(node, 'clientHeight', { get: () => sizes.clientHeight });
  Object.defineProperty(node, 'scrollTop', {
    get: () => sizes.scrollTop,
    set: (value: number) => {
      sizes.scrollTop = value;
    },
  });
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

/**
 * Ручной подскролл — часть чтения, а не команда «выключить». Движок приостанавливается
 * на время жеста и едет дальше сам; выключают его только кнопкой или доездом до низа.
 */
describe('useAutoScroll — ручной скролл приостанавливает, а не выключает', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('касание листа ставит на паузу, отпускание возобновляет — режим остаётся включённым', () => {
    const { node } = createContainer(1000, 500);
    const { result } = renderAutoScroll(node);

    act(() => result.current.play());
    expect(result.current.playing).toBe(true);

    act(() => {
      node.dispatchEvent(new Event('touchstart'));
    });
    expect(result.current.suspended, 'палец на листе — движок стоит').toBe(true);
    expect(result.current.playing, 'но режим не выключился').toBe(true);

    act(() => {
      node.dispatchEvent(new Event('touchend'));
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.suspended).toBe(false);
    expect(result.current.playing).toBe(true);
  });

  it('пока катится инерция, движок не трогается с места', () => {
    const { node, sizes } = createContainer(1000, 500);
    const { result } = renderAutoScroll(node);

    act(() => result.current.play());
    act(() => {
      node.dispatchEvent(new Event('touchstart'));
      node.dispatchEvent(new Event('touchend'));
    });

    // Инерция после свайпа: scrollTop продолжает меняться между проверками.
    act(() => {
      sizes.scrollTop = 120;
      vi.advanceTimersByTime(700); // первая проверка: позиция уехала
      sizes.scrollTop = 180;
      vi.advanceTimersByTime(120); // вторая: всё ещё едет
    });
    expect(result.current.suspended, 'прокрутка ещё идёт — навстречу ей не едем').toBe(true);

    // Докатилась и встала.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.suspended).toBe(false);
    expect(result.current.playing).toBe(true);
  });

  it('колесо мыши приостанавливает и тоже возобновляет само', () => {
    const { node } = createContainer(1000, 500);
    const { result } = renderAutoScroll(node);

    act(() => result.current.play());
    act(() => {
      node.dispatchEvent(new Event('wheel'));
    });
    expect(result.current.suspended).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.suspended).toBe(false);
    expect(result.current.playing).toBe(true);
  });

  it('кнопка выключает режим целиком, а не только приостановку', () => {
    const { node } = createContainer(1000, 500);
    const { result } = renderAutoScroll(node);

    act(() => result.current.play());
    act(() => {
      node.dispatchEvent(new Event('touchstart'));
    });
    expect(result.current.suspended).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
    expect(result.current.suspended).toBe(false);
  });
});

/**
 * `hold` — внешняя приостановка (экран включает её на время открытых шторок настроек /
 * тональности / состава сета). Отличие от `suspended`: команду даёт не жест, а UI, и
 * режим при этом остаётся включённым — закрытие шторки возвращает движение само.
 * Реальный баг: лист продолжал ехать под открытой шторкой, а FAB паузы в это время
 * скрыт — остановить автоскролл было нечем.
 */
describe('useAutoScroll — hold приостанавливает движок, не выключая режим', () => {
  /** Счётчик запланированных кадров: rAF-цикл «жив» ровно пока их планируют. */
  let scheduled: number;

  beforeEach(() => {
    scheduled = 0;
    vi.stubGlobal('requestAnimationFrame', () => {
      scheduled += 1;
      return scheduled;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  function renderWithHold(node: HTMLElement) {
    return renderHook(
      ({ hold }: { hold: boolean }) => {
        const containerRef = useRef<HTMLElement | null>(node);
        return useAutoScroll({ containerRef, songId: '1', enabled: true, hold });
      },
      { initialProps: { hold: false } },
    );
  }

  it('пока hold поднят, кадры не планируются, а playing остаётся true', () => {
    const { node } = createContainer(1000, 500);
    const { result, rerender } = renderWithHold(node);

    act(() => result.current.play());
    expect(scheduled, 'движок поехал').toBeGreaterThan(0);

    const beforeHold = scheduled;
    act(() => rerender({ hold: true }));
    expect(scheduled, 'шторка открыта — новых кадров нет').toBe(beforeHold);
    expect(result.current.playing, 'режим не выключился').toBe(true);

    // Закрытие шторки возвращает движение без повторного нажатия кнопки.
    act(() => rerender({ hold: false }));
    expect(scheduled, 'шторка закрыта — движок поехал сам').toBeGreaterThan(beforeHold);
    expect(result.current.playing).toBe(true);
  });

  it('кнопка паузы во время hold выключает режим целиком', () => {
    const { node } = createContainer(1000, 500);
    const { result, rerender } = renderWithHold(node);

    act(() => result.current.play());
    act(() => rerender({ hold: true }));
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);

    // Снятие hold не воскрешает выключенный режим.
    act(() => rerender({ hold: false }));
    expect(result.current.playing).toBe(false);
  });
});
