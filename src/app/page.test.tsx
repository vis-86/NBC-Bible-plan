// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const pushMock = vi.hoisted(() => vi.fn());

// Хуки и навигация мокаются, чтобы рендерить лендинг изолированно.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({ canInstall: false, installed: false, install: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

import Home from './page';
import { SUPPORT_CONTACT } from '@/lib/constants';

// jsdom не реализует matchMedia / IntersectionObserver — нужны для
// useReducedMotion, useIsStandalone (display-mode) и motion whileInView.
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

  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
});

describe('Лендинг (page.tsx)', () => {
  it('рендерит ключевые секции и CTA', () => {
    render(<Home />);

    // Hero
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('всегда под рукой');

    // Три шага invite-регистрации
    expect(screen.getByText('Напишите нам')).toBeInTheDocument();
    expect(screen.getByText('Откройте ссылку с телефона')).toBeInTheDocument();
    expect(screen.getByText('Придумайте логин и пароль')).toBeInTheDocument();

    // Секция установки PWA (canInstall=false → пошаговая инструкция)
    expect(screen.getByText('Установите на телефон')).toBeInTheDocument();

    // Кнопки «Войти» (header + hero + finalCta)
    expect(screen.getAllByText('Войти').length).toBeGreaterThan(0);
  });

  it('показывает карточки «Песни» и «Оффлайн» в About и секцию FeatureShowcase', () => {
    render(<Home />);

    expect(screen.getByText('Песни с аккордами')).toBeInTheDocument();
    expect(screen.getByText('Работает без интернета')).toBeInTheDocument();

    expect(document.querySelector('[data-feature-showcase]')).toBeInTheDocument();
    expect(document.querySelector('[data-feature-showcase-item="plan"]')).toBeInTheDocument();
    expect(document.querySelector('[data-feature-showcase-item="songs"]')).toBeInTheDocument();
    expect(document.querySelector('[data-feature-showcase-item="offline"]')).toBeInTheDocument();
  });

  it('CTA «Получить доступ» ведёт во внешнюю поддержку', () => {
    render(<Home />);

    const accessLinks = screen.getAllByRole('link', { name: /Получить доступ/ });
    expect(accessLinks.length).toBeGreaterThan(0);
    for (const link of accessLinks) {
      expect(link).toHaveAttribute('href', SUPPORT_CONTACT);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });
});

describe('Лендинг при включённой регистрации (NEXT_PUBLIC_REGISTER_ENABLED=true)', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_REGISTER_ENABLED;
    pushMock.mockReset();
  });

  it('показывает CTA «Зарегистрироваться» и шаги по коду церкви вместо invite', () => {
    process.env.NEXT_PUBLIC_REGISTER_ENABLED = 'true';
    render(<Home />);

    // Primary CTA заменён на «Зарегистрироваться»; «Получить доступ» больше нет.
    expect(screen.getAllByText('Зарегистрироваться').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Получить доступ/ })).not.toBeInTheDocument();

    // Шаги по коду церкви, а не invite.
    expect(screen.getByText('Возьмите код церкви')).toBeInTheDocument();
    expect(screen.getByText('Введите код церкви')).toBeInTheDocument();
    expect(screen.queryByText('Напишите нам')).not.toBeInTheDocument();
  });

  it('кнопка «Зарегистрироваться» ведёт на /register', () => {
    process.env.NEXT_PUBLIC_REGISTER_ENABLED = 'true';
    render(<Home />);

    fireEvent.click(screen.getAllByText('Зарегистрироваться')[0]);
    expect(pushMock).toHaveBeenCalledWith('/register');
  });
});

describe('HowToStart — матрица register×code', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_REGISTER_ENABLED;
    delete process.env.NEXT_PUBLIC_REGISTER_REQUIRE_CODE;
  });

  it('REGISTER_ENABLED=true + REQUIRE_CODE=false → шаги без кода', () => {
    process.env.NEXT_PUBLIC_REGISTER_ENABLED = 'true';
    process.env.NEXT_PUBLIC_REGISTER_REQUIRE_CODE = 'false';
    render(<Home />);

    expect(screen.getByText('Придумайте логин и пароль')).toBeInTheDocument();
    expect(screen.getByText('Читайте в своём ритме')).toBeInTheDocument();
    expect(screen.queryByText('Возьмите код церкви')).not.toBeInTheDocument();
  });

  it('REGISTER_ENABLED=true + REQUIRE_CODE=true (по умолчанию) → шаги с кодом церкви', () => {
    process.env.NEXT_PUBLIC_REGISTER_ENABLED = 'true';
    render(<Home />);

    expect(screen.getByText('Возьмите код церкви')).toBeInTheDocument();
    expect(screen.getByText('Введите код церкви')).toBeInTheDocument();
    expect(screen.queryByText('Придумайте логин и пароль')).not.toBeInTheDocument();
  });
});
