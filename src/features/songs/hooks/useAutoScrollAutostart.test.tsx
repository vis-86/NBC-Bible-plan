// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoScrollAutostart, type UseAutoScrollAutostartParams } from './useAutoScrollAutostart';

describe('useAutoScrollAutostart', () => {
  let container: HTMLDivElement;
  const ref = { current: null as HTMLDivElement | null };

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    ref.current = container;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (overrides: Partial<UseAutoScrollAutostartParams> = {}) => {
    const onStart = vi.fn();
    const initial: UseAutoScrollAutostartParams = {
      containerRef: ref,
      songId: '1',
      enabled: true,
      playing: false,
      delaySeconds: 3,
      onStart,
      ...overrides,
    };
    const hook = renderHook((props: UseAutoScrollAutostartParams) => useAutoScrollAutostart(props), { initialProps: initial });
    return { ...hook, onStart, initial };
  };

  it('отсчитывает секунды и стартует один раз', () => {
    const { result, onStart } = setup();
    expect(result.current).toBe(3);

    act(() => vi.advanceTimersByTime(1250));
    expect(result.current).toBe(2);

    act(() => vi.advanceTimersByTime(2000));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();

    act(() => vi.advanceTimersByTime(10_000));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('выключенная настройка — отсчёта нет', () => {
    const { result, onStart } = setup({ enabled: false });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('касание листа отменяет отсчёт на эту песню, новая песня — новый отсчёт', () => {
    const { result, onStart, rerender, initial } = setup();
    act(() => {
      container.dispatchEvent(new Event('touchstart'));
    });
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(onStart).not.toHaveBeenCalled();

    rerender({ ...initial, songId: '2' });
    expect(result.current).toBe(3);
    act(() => vi.advanceTimersByTime(3000));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('ручной старт гасит автозапуск: после паузы отсчёт не возвращается', () => {
    const { result, onStart, rerender, initial } = setup();
    rerender({ ...initial, playing: true });
    rerender({ ...initial, playing: false });
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('шторка приостанавливает отсчёт, после закрытия — с полной задержки', () => {
    const { result, onStart, rerender, initial } = setup();
    act(() => vi.advanceTimersByTime(2000));
    rerender({ ...initial, enabled: false });
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(5000));

    rerender({ ...initial, enabled: true });
    expect(result.current).toBe(3);
    act(() => vi.advanceTimersByTime(2000));
    expect(onStart).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
