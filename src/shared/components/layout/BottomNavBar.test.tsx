// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const pushMock = vi.fn();
let mockPathname = '/dashboard';
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

import BottomNavBar from './BottomNavBar';
import { ChromeVisibilityProvider, useChromeVisibility } from './ChromeVisibility';

function Controls() {
  const { setChromeHidden } = useChromeVisibility();
  return (
    <div>
      <button onClick={() => setChromeHidden(true)}>hide-chrome</button>
      <button onClick={() => setChromeHidden(false)}>show-chrome</button>
    </div>
  );
}

function renderNav() {
  return render(
    <ChromeVisibilityProvider>
      <Controls />
      <BottomNavBar />
    </ChromeVisibilityProvider>
  );
}

describe('BottomNavBar', () => {
  beforeEach(() => {
    pushMock.mockClear();
    mockPathname = '/dashboard';
    mockSearchParams = new URLSearchParams();
  });

  it('клик по неактивному пункту вызывает router.push', () => {
    renderNav();
    fireEvent.click(screen.getByText('Песни'));
    expect(pushMock).toHaveBeenCalledWith('/dashboard/songs');
  });

  it('клик по активному пункту («Библия» на /dashboard/read) — no-op, без router.push', () => {
    mockPathname = '/dashboard/read';
    mockSearchParams = new URLSearchParams({ book: 'Иоанна', chapter: '3' });
    renderNav();

    fireEvent.click(screen.getByText('Библия'));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('при chromeHidden nav получает атрибут скрытия и pointer-events-none', () => {
    const { container } = renderNav();
    const nav = container.querySelector('[data-dashboard-layout-bottom-nav]')!;

    expect(nav).not.toHaveAttribute('data-dashboard-layout-bottom-nav-hidden');
    expect(nav.className).not.toContain('pointer-events-none');

    fireEvent.click(screen.getByText('hide-chrome'));
    expect(nav).toHaveAttribute('data-dashboard-layout-bottom-nav-hidden', 'true');
    expect(nav.className).toContain('pointer-events-none');

    fireEvent.click(screen.getByText('show-chrome'));
    expect(nav).not.toHaveAttribute('data-dashboard-layout-bottom-nav-hidden');
    expect(nav.className).not.toContain('pointer-events-none');
  });

  it('пишет реально измеренную высоту бара в --dock-nav-actual-h (клиренс контента не занижается статичной оценкой)', () => {
    const callbacks: ResizeObserverCallback[] = [];
    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb);
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    const originalRO = globalThis.ResizeObserver;
    // @ts-expect-error — минимальный мок ResizeObserver, jsdom его не реализует
    globalThis.ResizeObserver = MockResizeObserver;

    try {
      const { container } = renderNav();
      const nav = container.querySelector('[data-dashboard-layout-bottom-nav]') as HTMLElement;
      // Реальный бар выше статичной оценки --dock-nav-h (56px) — именно этот
      // разрыв резал карточку песни навигацией до фикса.
      vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ height: 74 } as DOMRect);

      callbacks.forEach((cb) => cb([], new MockResizeObserver(() => {}) as unknown as ResizeObserver));

      expect(document.documentElement.style.getPropertyValue('--dock-nav-actual-h')).toBe('74px');
    } finally {
      globalThis.ResizeObserver = originalRO;
      document.documentElement.style.removeProperty('--dock-nav-actual-h');
    }
  });
});
