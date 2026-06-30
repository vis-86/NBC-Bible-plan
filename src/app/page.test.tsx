// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Хуки и навигация мокаются, чтобы рендерить лендинг изолированно.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({ canInstall: false, installed: false, install: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('без чувства вины');

    // Три шага invite-регистрации
    expect(screen.getByText('Напишите нам')).toBeInTheDocument();
    expect(screen.getByText('Откройте ссылку с телефона')).toBeInTheDocument();
    expect(screen.getByText('Придумайте логин и пароль')).toBeInTheDocument();

    // Секция установки PWA (canInstall=false → iOS-инструкция)
    expect(screen.getByText('Установите на телефон')).toBeInTheDocument();

    // Кнопки «Войти» (header + hero + finalCta)
    expect(screen.getAllByText('Войти').length).toBeGreaterThan(0);
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
