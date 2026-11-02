// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
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

  it('пункт «Сеты» ведёт на список сетлистов', () => {
    renderNav();
    fireEvent.click(screen.getByText('Сеты'));
    expect(pushMock).toHaveBeenCalledWith('/dashboard/setlists');
  });

  it.each(['/dashboard/setlists', '/dashboard/setlist', '/dashboard/setlist-edit'])(
    '«Сеты» активны на %s',
    (path) => {
      mockPathname = path;
      const { container } = renderNav();
      const item = container.querySelector('[data-dashboard-nav-item="setlists"]')!;
      expect(item).toHaveAttribute('data-dashboard-nav-item-active', 'true');
    }
  );

  it.each(['/dashboard/songs', '/dashboard/song'])('«Сеты» НЕ активны на %s (префиксы не пересекаются)', (path) => {
    mockPathname = path;
    const { container } = renderNav();
    const item = container.querySelector('[data-dashboard-nav-item="setlists"]')!;
    expect(item).not.toHaveAttribute('data-dashboard-nav-item-active');
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

});

describe('BottomNavBar — режим приложения', () => {
  beforeEach(() => {
    pushMock.mockClear();
    mockPathname = '/dashboard/songs';
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const navIds = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-dashboard-nav-item]')).map((el) =>
      el.getAttribute('data-dashboard-nav-item')
    );

  it('church: Главная и Библия на месте', () => {
    const { container } = renderNav();
    const ids = navIds(container);
    expect(ids).toContain('home');
    expect(ids).toContain('bible');
    expect(ids).toEqual(expect.arrayContaining(['songs', 'setlists', 'settings']));
  });

  it('worship: только «Песни», «Сеты», «Профиль»', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'worship');
    vi.stubEnv('NEXT_PUBLIC_AI_ENABLE', 'true');
    const { container } = renderNav();
    expect(navIds(container)).toEqual(['songs', 'setlists', 'settings']);
    expect(screen.queryByText('Библия')).not.toBeInTheDocument();
    expect(screen.queryByText('Пастырь')).not.toBeInTheDocument();
  });
});
