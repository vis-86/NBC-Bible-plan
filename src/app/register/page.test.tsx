// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

  it('рендерит форму без поля кода церкви и без повтора пароля', () => {
    render(<RegisterPage />);

    expect(screen.getByLabelText('Логин')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
    expect(screen.queryByLabelText('Повторите пароль')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Код церкви')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать аккаунт/ })).toBeInTheDocument();
  });

  it('показывает InstallAppHint под формой', () => {
    render(<RegisterPage />);
    expect(document.querySelector('[data-install-app-hint]')).toBeInTheDocument();
  });

  it('пароль короче 8 символов → ошибка без вызова fetch', () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'brother_ivan' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /Создать аккаунт/ }));

    expect(screen.getByRole('alert')).toHaveTextContent(/не менее 8 символов/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('кириллица в логине → подсказка про раскладку при blur, сабмит не уходит', () => {
    render(<RegisterPage />);

    const login = screen.getByLabelText('Логин');
    fireEvent.change(login, { target: { value: 'иван' } });
    fireEvent.blur(login);
    expect(screen.getByRole('alert')).toHaveTextContent(/латиницей/);

    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Создать аккаунт/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ошибка логина снимается, как только ввод стал валидным', () => {
    render(<RegisterPage />);

    const login = screen.getByLabelText('Логин');
    fireEvent.change(login, { target: { value: 'ab' } });
    fireEvent.blur(login);
    expect(screen.getByRole('alert')).toHaveTextContent(/минимум 3/);

    fireEvent.change(login, { target: { value: 'abc' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('кнопка «Показать пароль» переключает type поля', () => {
    render(<RegisterPage />);

    const password = screen.getByLabelText('Пароль') as HTMLInputElement;
    expect(password.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Показать пароль' }));
    expect(password.type).toBe('text');
  });

  it('успех → экран «Аккаунт создан» с логином, пароль скрыт до нажатия на глаз', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: ' brother_ivan ' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Создать аккаунт/ }));

    expect(await screen.findByText('Аккаунт создан')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ login: 'brother_ivan', password: 'password123' });
    expect(document.querySelector('[data-register-success-login]')).toHaveTextContent('brother_ivan');
    expect(screen.queryByText('password123')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Показать пароль' }));
    expect(screen.getByText('password123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Начать читать/ })).toBeInTheDocument();
  });

  it('409 «логин занят» → ошибка у поля логина, форма остаётся', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Этот логин уже занят. Выберите другой.' }),
    });
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'brother_ivan' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Создать аккаунт/ }));

    await waitFor(() => {
      expect(document.querySelector('[data-register-form-login-error]')).toHaveTextContent(/уже занят/);
    });
    expect(screen.getByLabelText('Логин')).toHaveAttribute('aria-invalid', 'true');
  });

  it('сетевая ошибка → общее сообщение', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'brother_ivan' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Создать аккаунт/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Ошибка сети/);
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
