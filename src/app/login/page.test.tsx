// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

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

describe('/login — путь для нового пользователя', () => {
  const fetchMock = vi.fn();

  beforeAll(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_REGISTER_ENABLED;
    fetchMock.mockReset();
  });

  it('регистрация включена → заметная кнопка «Создать аккаунт» ведёт на /register', async () => {
    process.env.NEXT_PUBLIC_REGISTER_ENABLED = 'true';
    render(<LoginPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Создать аккаунт' }));
    expect(pushMock).toHaveBeenCalledWith('/register');
  });

  it('регистрация выключена → вместо кнопки ссылка за приглашением в поддержку', async () => {
    render(<LoginPage />);

    expect(await screen.findByRole('link', { name: 'Получить приглашение' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Создать аккаунт' })).not.toBeInTheDocument();
  });

  it('401 → подсказка «ещё не регистрировались?», сетевая ошибка → без неё', async () => {
    process.env.NEXT_PUBLIC_REGISTER_ENABLED = 'true';
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Неверный логин или пароль' }) });
    render(<LoginPage />);

    fireEvent.change(await screen.findByLabelText('Логин'), { target: { value: 'nobody' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'whatever1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Ещё не регистрировались/);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).not.toHaveTextContent(/Ещё не регистрировались/);
    });
  });
});
