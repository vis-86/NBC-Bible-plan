// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const pushMock = vi.hoisted(() => vi.fn());
const installMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({ canInstall: false, installed: false, install: installMock }),
}));
vi.mock('@/shared/hooks/useIsStandalone', () => ({
  useIsStandalone: () => false,
}));
vi.mock('@/lib/telegram', () => ({
  isTelegramWebApp: () => false,
}));

import RegisterPage from './page';

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
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_REGISTER_ENABLED;
  delete process.env.NEXT_PUBLIC_REGISTER_REQUIRE_CODE;
  pushMock.mockReset();
  installMock.mockReset();
  fetchMock.mockReset();
});

describe('/register — register включён, код НЕ требуется', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_REGISTER_ENABLED = 'true';
    process.env.NEXT_PUBLIC_REGISTER_REQUIRE_CODE = 'false';
  });

  it('рендерит форму без поля кода церкви', () => {
    render(<RegisterPage />);

    expect(screen.getByLabelText('Логин')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
    expect(screen.getByLabelText('Повторите пароль')).toBeInTheDocument();
    expect(screen.queryByLabelText('Код церкви')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Зарегистрироваться/ })).toBeInTheDocument();
  });

  it('показывает InstallAppHint под формой', () => {
    render(<RegisterPage />);
    expect(document.querySelector('[data-install-app-hint]')).toBeInTheDocument();
  });

  it('пароль короче 8 символов → ошибка без вызова fetch', () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'brother_ivan' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /Зарегистрироваться/ }));

    expect(screen.getByRole('alert')).toHaveTextContent(/не менее 8 символов/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('пароли не совпадают → инлайн-ошибка при blur', () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password123' } });
    const confirm = screen.getByLabelText('Повторите пароль');
    fireEvent.change(confirm, { target: { value: 'different1' } });
    fireEvent.blur(confirm);

    expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument();
  });

  it('кнопка «Показать пароль» переключает type поля', () => {
    render(<RegisterPage />);

    const password = screen.getByLabelText('Пароль') as HTMLInputElement;
    expect(password.type).toBe('password');

    fireEvent.click(screen.getAllByRole('button', { name: 'Показать пароль' })[0]);
    expect(password.type).toBe('text');
  });
});

describe('/register — register включён, код требуется', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_REGISTER_ENABLED = 'true';
  });

  it('показывает поле «Код церкви»', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText('Код церкви')).toBeInTheDocument();
  });
});

describe('/register — register выключен', () => {
  it('показывает заглушку со ссылкой в поддержку и без InstallAppHint', () => {
    render(<RegisterPage />);

    expect(screen.getByText('Регистрация недоступна')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'поддержка' })).toBeInTheDocument();
    expect(document.querySelector('[data-install-app-hint]')).not.toBeInTheDocument();
  });
});
