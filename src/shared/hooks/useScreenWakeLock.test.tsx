// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useScreenWakeLock } from './useScreenWakeLock';

function Harness() {
  useScreenWakeLock();
  return null;
}

type FakeSentinel = { released: boolean; release: ReturnType<typeof vi.fn> };

function makeSentinel(): FakeSentinel {
  const s: FakeSentinel = {
    released: false,
    release: vi.fn(async () => {
      s.released = true;
    }),
  };
  return s;
}

let visibility: DocumentVisibilityState = 'visible';
const request = vi.fn();

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useScreenWakeLock', () => {
  beforeEach(() => {
    visibility = 'visible';
    request.mockReset();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
  });

  afterEach(() => {
    // @ts-expect-error — снимаем стаб, чтобы не протекал в соседние файлы
    delete navigator.wakeLock;
  });

  it('запрашивает screen-lock при монтировании и отпускает при размонтировании', async () => {
    const sentinel = makeSentinel();
    request.mockResolvedValue(sentinel);
    const { unmount } = render(<Harness />);
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    unmount();
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('перезапрашивает lock при возврате во вкладку (браузер снял его в фоне)', async () => {
    const first = makeSentinel();
    request.mockResolvedValueOnce(first).mockResolvedValueOnce(makeSentinel());
    render(<Harness />);
    await flush();

    first.released = true; // так делает браузер при уходе в фон
    setVisibility('hidden');
    await flush();
    expect(request).toHaveBeenCalledTimes(1); // в фоне не запрашиваем

    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('не дублирует запрос, пока lock активен', async () => {
    request.mockResolvedValue(makeSentinel());
    render(<Harness />);
    await flush();
    document.dispatchEvent(new Event('pointerdown'));
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('после отказа повторяет запрос на касании', async () => {
    request.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    request.mockResolvedValueOnce(makeSentinel());
    render(<Harness />);
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('без Wake Lock API — no-op', () => {
    // @ts-expect-error — эмулируем браузер без API
    delete navigator.wakeLock;
    expect(() => render(<Harness />)).not.toThrow();
  });
});
