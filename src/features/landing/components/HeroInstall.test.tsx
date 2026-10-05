// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { InstallEnv } from '@/shared/components/pwa/installEnv';

const state = vi.hoisted(() => ({
  env: null as InstallEnv | null,
  canInstall: false,
  installed: false,
  standalone: false,
  install: vi.fn(),
}));

vi.mock('@/shared/components/pwa/useInstallEnv', () => ({ useInstallEnv: () => state.env }));
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({ canInstall: state.canInstall, installed: state.installed, install: state.install }),
}));
vi.mock('@/shared/hooks/useIsStandalone', () => ({ useIsStandalone: () => state.standalone }));

import { HeroInstall } from './HeroInstall';
import { InstallGuide } from './InstallGuide';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
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

beforeEach(() => {
  Object.assign(state, { env: null, canInstall: false, installed: false, standalone: false });
  state.install.mockReset();
});

describe('HeroInstall', () => {
  it('до гидрации — общий вход в инструкцию', () => {
    render(<HeroInstall />);
    expect(screen.getByText('Это приложение для телефона')).toBeInTheDocument();
    expect(screen.getByText('Как установить — 30 секунд').closest('a')).toHaveAttribute('href', '#install');
  });

  it('iPhone: рецепт «Поделиться → На экран „Домой“» с подсказкой про «•••»', () => {
    state.env = { os: 'ios', browser: 'safari', inApp: false };
    render(<HeroInstall />);
    expect(document.querySelector('[data-landing-hero-install-recipe="ios"]')).toHaveTextContent(
      'ПоделитьсяНа экран «Домой»',
    );
    expect(screen.getByText(/Нажмите «•••»/)).toBeInTheDocument();
  });

  it('Android с prompt: установка в один тап', () => {
    state.env = { os: 'android', browser: 'chrome', inApp: false };
    state.canInstall = true;
    render(<HeroInstall />);
    fireEvent.click(screen.getByText('Установить приложение'));
    expect(state.install).toHaveBeenCalledTimes(1);
  });

  it('мессенджер: просит открыть в браузере', () => {
    state.env = { os: 'ios', browser: 'other', inApp: true };
    render(<HeroInstall />);
    expect(screen.getByText(/открыт внутри мессенджера/)).toBeInTheDocument();
  });

  it('скрыт, если приложение уже установлено', () => {
    state.standalone = true;
    const { container } = render(<HeroInstall />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('InstallGuide', () => {
  it('iPhone: вкладка по умолчанию — iPhone, шаги учитывают iOS 26', () => {
    state.env = { os: 'ios', browser: 'safari', inApp: false };
    render(<InstallGuide />);
    expect(screen.getByRole('button', { name: /iPhone/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Оставьте включённым «Открыть как веб-приложение»')).toBeInTheDocument();
    expect(screen.queryByText(/установка не работает/)).not.toBeInTheDocument();
  });

  it('мессенджер: вместо вкладок — «откройте в браузере» и копирование ссылки', () => {
    state.env = { os: 'android', browser: 'chrome', inApp: true };
    render(<InstallGuide />);
    expect(document.querySelector('[data-landing-install-in-app]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /iPhone/ })).not.toBeInTheDocument();
    expect(screen.getByText('Скопировать ссылку')).toBeInTheDocument();
  });
});
