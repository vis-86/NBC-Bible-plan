// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let mockPathname = '/dashboard/songs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/shared/offline/appShell', () => ({
  warmAppShellOnceOnline: vi.fn(async () => {}),
}));

import DashboardLayout from './DashboardLayout';
import { useChromeVisibility } from './ChromeVisibility';

/** Дёргает chromeHidden изнутри дерева DashboardLayout (провайдер живёт внутри него). */
function ChromeControls() {
  const { setChromeHidden } = useChromeVisibility();
  return (
    <div>
      <button onClick={() => setChromeHidden(true)}>hide-chrome</button>
      <button onClick={() => setChromeHidden(false)}>show-chrome</button>
    </div>
  );
}

function getMain(container: HTMLElement) {
  return container.querySelector('[data-dashboard-layout-main]')!;
}

describe('DashboardLayout — резерв места под bottom nav (pb-nav)', () => {
  beforeEach(() => {
    mockPathname = '/dashboard/songs';
  });

  it('на докнутой странице резервирует pb-nav, пока chrome виден', () => {
    const { container } = render(
      <DashboardLayout>
        <ChromeControls />
      </DashboardLayout>
    );

    expect(getMain(container).className).toContain('pb-nav');
  });

  it('прячет резерв pb-nav синхронно со скрытием бара по скроллу — иначе внизу остаётся пустой блок', () => {
    const { container } = render(
      <DashboardLayout>
        <ChromeControls />
      </DashboardLayout>
    );

    fireEvent.click(screen.getByText('hide-chrome'));
    expect(getMain(container).className).not.toContain('pb-nav');

    fireEvent.click(screen.getByText('show-chrome'));
    expect(getMain(container).className).toContain('pb-nav');
  });

  it('на странице ридера место под nav никогда не резервируется (nav — оверлей)', () => {
    mockPathname = '/dashboard/read';
    const { container } = render(
      <DashboardLayout>
        <ChromeControls />
      </DashboardLayout>
    );

    expect(getMain(container).className).not.toContain('pb-nav');

    fireEvent.click(screen.getByText('show-chrome'));
    expect(getMain(container).className).not.toContain('pb-nav');
  });

  it('при hideBottomNav место под nav не резервируется', () => {
    const { container } = render(
      <DashboardLayout hideBottomNav>
        <ChromeControls />
      </DashboardLayout>
    );

    expect(getMain(container).className).not.toContain('pb-nav');
  });
});
