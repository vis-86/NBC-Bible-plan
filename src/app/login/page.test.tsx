// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.hoisted(() => vi.fn());
const installMock = vi.hoisted(() => vi.fn());
const isStandaloneMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({ canInstall: false, installed: false, install: installMock }),
}));
vi.mock('@/shared/hooks/useIsStandalone', () => ({
  useIsStandalone: () => isStandaloneMock(),
}));
// hasTelegramWebAppObject=false → LoginForm сразу показывает обычную форму (не Telegram-ветки).
vi.mock('@/lib/telegram', () => ({
  hasTelegramWebAppObject: () => false,
  isTelegramWebApp: () => false,
  initTelegramWebApp: () => {},
  getTelegramInitData: () => undefined,
}));

import LoginPage from './page';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  pushMock.mockReset();
  installMock.mockReset();
  isStandaloneMock.mockReset().mockReturnValue(false);
});

describe('/login — форма обычного входа', () => {
  it('рендерит поля логина/пароля и кнопку «Войти»', async () => {
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Логин')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  it('показывает InstallAppHint под формой', async () => {
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Логин')).toBeInTheDocument();
    });
    expect(document.querySelector('[data-install-app-hint]')).toBeInTheDocument();
  });

  it('скрывает InstallAppHint, если приложение уже standalone', async () => {
    isStandaloneMock.mockReturnValue(true);
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Логин')).toBeInTheDocument();
    });
    expect(document.querySelector('[data-install-app-hint]')).not.toBeInTheDocument();
  });
});
