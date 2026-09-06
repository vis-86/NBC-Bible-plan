// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

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

function getMain(container: HTMLElement) {
  return container.querySelector('[data-dashboard-layout-main]')!;
}

describe('DashboardLayout — клиренс под плавающий бар', () => {
  beforeEach(() => {
    mockPathname = '/dashboard/songs';
  });

  // Плавающий бар — position:fixed, парит над контентом. Клиренс (.pb-nav) теперь
  // живёт ВНУТРИ каждого экрана-скроллера (headroom прокрутки), а не резервируется
  // на общем main — иначе под баром была бы пустая полоса-«футер», и контент не
  // уходил бы под полупрозрачный бар.
  it('main НЕ резервирует место под nav (клиренс — внутри скроллеров экранов)', () => {
    const { container } = render(
      <DashboardLayout>
        <div>content</div>
      </DashboardLayout>
    );

    expect(getMain(container).className).not.toContain('pb-nav');
  });

  it('рендерит нижнюю навигацию по умолчанию', () => {
    const { container } = render(
      <DashboardLayout>
        <div>content</div>
      </DashboardLayout>
    );

    expect(container.querySelector('[data-dashboard-layout-bottom-nav]')).not.toBeNull();
  });

  it('при hideBottomNav навигация не рендерится', () => {
    const { container } = render(
      <DashboardLayout hideBottomNav>
        <div>content</div>
      </DashboardLayout>
    );

    expect(container.querySelector('[data-dashboard-layout-bottom-nav]')).toBeNull();
  });
});
