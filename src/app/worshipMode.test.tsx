// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard',
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({ canInstall: false, installed: false, install: vi.fn() }),
}));
vi.mock('@/shared/hooks/useIsStandalone', () => ({
  useIsStandalone: () => false,
}));
vi.mock('@/lib/telegram', () => ({
  hasTelegramWebAppObject: () => false,
  isTelegramWebApp: () => false,
  initTelegramWebApp: () => {},
  getTelegramInitData: () => undefined,
}));
// Страница плана тянет полдюжины тяжёлых модулей — здесь важен только выбор ветки.
vi.mock('@/features/plan/components/PlanView', () => ({ PlanView: () => null }));
vi.mock('@/features/plan/hooks/usePlan', () => ({
  usePlan: () => ({
    plan: [],
    readChapters: new Set(),
    loading: false,
    error: null,
    fetchPlan: vi.fn(),
    setReadChapters: vi.fn(),
  }),
}));
vi.mock('@/features/plan/hooks/useProgress', () => ({
  useProgress: () => ({ toggleItem: vi.fn(), toggleComplete: vi.fn() }),
}));
vi.mock('@/components/PastorChat', () => ({ default: () => null }));
vi.mock('@/components/ReferenceTool', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-plan-layout>{children}</div>,
}));

import Home from './page';
import LoginPage from './login/page';
import RegisterPage from './register/page';
import DashboardPage from './dashboard/page';

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
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  vi.unstubAllEnvs();
  pushMock.mockReset();
  replaceMock.mockReset();
});

function enableWorship() {
  vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'worship');
  // Регистрация и код церкви открыты в окружении — worship обязан игнорировать флаги.
  vi.stubEnv('NEXT_PUBLIC_REGISTER_ENABLED', 'true');
}

describe('режим worship — маршруты и страницы', () => {
  it('/dashboard редиректит на список песен', () => {
    enableWorship();
    render(<DashboardPage />);
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/songs');
  });

  it('church: /dashboard не редиректит на песни', () => {
    render(<DashboardPage />);
    expect(replaceMock).not.toHaveBeenCalledWith('/dashboard/songs');
  });

  it('/register редиректит на /login', () => {
    enableWorship();
    render(<RegisterPage />);
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('church: /register остаётся формой регистрации', () => {
    vi.stubEnv('NEXT_PUBLIC_REGISTER_ENABLED', 'true');
    render(<RegisterPage />);
    expect(replaceMock).not.toHaveBeenCalledWith('/login');
    expect(screen.getByLabelText(/Логин/)).toBeInTheDocument();
  });

  it('/login без ссылки на регистрацию и без текстов церкви', async () => {
    enableWorship();
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'Хвала');
    const { container } = render(<LoginPage />);
    expect(await screen.findByText('Хвала')).toBeInTheDocument();
    expect(container.querySelector('[data-login-new-user]')).toBeNull();
    expect(screen.queryByText('Создать аккаунт')).not.toBeInTheDocument();
    expect(screen.queryByText(/Библи/)).not.toBeInTheDocument();
    const logos = Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(logos.some((src) => src?.includes('/icons/worship/'))).toBe(true);
    expect(logos.some((src) => src?.includes('/icons/icon-'))).toBe(false);
  });

  it('church: /login показывает блок «Впервые здесь?»', async () => {
    vi.stubEnv('NEXT_PUBLIC_REGISTER_ENABLED', 'true');
    const { container } = render(<LoginPage />);
    expect(await screen.findByText('Впервые здесь?')).toBeInTheDocument();
    expect(container.querySelector('[data-login-new-user]')).not.toBeNull();
  });

  it('лендинг: бренд, «Войти», установка PWA; без регистрации и текстов NBC', () => {
    enableWorship();
    const { container } = render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Аккорды');
    expect(container.querySelector('[data-landing-login-btn]')).not.toBeNull();
    expect(container.querySelector('[data-landing-install]')).not.toBeNull();
    expect(container.querySelector('[data-landing-register-btn]')).toBeNull();
    expect(container.textContent).not.toMatch(/Библи|NBC|Нижегород/i);
    const logos = Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(logos.some((src) => src?.includes('/icons/worship/'))).toBe(true);
    expect(logos.some((src) => src?.includes('/icons/icon-'))).toBe(false);
  });

  it('church: лендинг прежний (Hero «всегда под рукой»)', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('всегда под рукой');
  });
});
