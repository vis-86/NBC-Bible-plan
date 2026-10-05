// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

function makePromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

// Модульное состояние — на каждый кейс свежий модуль.
async function loadHook() {
  vi.resetModules();
  return (await import('./usePWAInstall')).usePWAInstall;
}

describe('usePWAInstall', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('событие, пришедшее ДО монтирования (другая страница), не теряется', async () => {
    const usePWAInstall = await loadHook();
    const event = makePromptEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(true);
  });

  it('install() вызывает prompt один раз и сбрасывает canInstall у всех потребителей', async () => {
    const usePWAInstall = await loadHook();
    const first = renderHook(() => usePWAInstall());
    const second = renderHook(() => usePWAInstall());
    const event = makePromptEvent('accepted');
    act(() => {
      window.dispatchEvent(event);
    });
    expect(second.result.current.canInstall).toBe(true);

    let accepted = false;
    await act(async () => {
      accepted = await first.result.current.install();
    });
    expect(accepted).toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(first.result.current.canInstall).toBe(false);
    expect(second.result.current.canInstall).toBe(false);
  });

  it('сбой prompt() не пробрасывается и освобождает событие', async () => {
    const usePWAInstall = await loadHook();
    const { result } = renderHook(() => usePWAInstall());
    const event = makePromptEvent();
    event.prompt.mockRejectedValue(new Error('NotAllowedError'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    act(() => {
      window.dispatchEvent(event);
    });

    let accepted = true;
    await act(async () => {
      accepted = await result.current.install();
    });
    expect(accepted).toBe(false);
    expect(result.current.canInstall).toBe(false);
  });

  it('appinstalled → installed', async () => {
    const usePWAInstall = await loadHook();
    const { result } = renderHook(() => usePWAInstall());
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.installed).toBe(true);
  });
});
