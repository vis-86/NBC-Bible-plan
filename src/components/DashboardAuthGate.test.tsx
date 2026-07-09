// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const replaceMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams('day=5'),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

import DashboardAuthGate from './DashboardAuthGate';

afterEach(() => {
  vi.clearAllMocks();
});

describe('DashboardAuthGate', () => {
  it('loading -> показывает FullScreenLoader, НЕ children', () => {
    useAuthMock.mockReturnValue({ user: null, loading: true });
    render(
      <DashboardAuthGate>
        <div>protected content</div>
      </DashboardAuthGate>
    );
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('нет юзера, не loading -> редирект на /login с redirect=pathname+search', async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    render(
      <DashboardAuthGate>
        <div>protected content</div>
      </DashboardAuthGate>
    );
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?redirect=%2Fdashboard%3Fday%3D5');
    });
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('юзер есть -> рендерит children без редиректа', () => {
    useAuthMock.mockReturnValue({ user: { directus_id: '1', first_name: 'Т' }, loading: false });
    render(
      <DashboardAuthGate>
        <div>protected content</div>
      </DashboardAuthGate>
    );
    expect(screen.getByText('protected content')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('last-known-user (офлайн-фолбэк из AuthProvider) -> рендерит children', () => {
    // AuthProvider уже отдаёт last-known-user через `user` при сетевой ошибке —
    // гейт не различает "server-confirmed" и "last-known", просто доверяет user.
    useAuthMock.mockReturnValue({ user: { directus_id: '1', first_name: 'Офлайн' }, loading: false });
    render(
      <DashboardAuthGate>
        <div>protected content</div>
      </DashboardAuthGate>
    );
    expect(screen.getByText('protected content')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
