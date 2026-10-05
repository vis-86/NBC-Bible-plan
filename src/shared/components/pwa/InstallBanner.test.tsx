// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { InstallEnv } from './installEnv';

const state = vi.hoisted(() => ({
  env: null as InstallEnv | null,
  canInstall: false,
  installed: false,
  standalone: false,
  telegram: false,
  install: vi.fn(),
}));

vi.mock('./useInstallEnv', () => ({ useInstallEnv: () => state.env }));
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({ canInstall: state.canInstall, installed: state.installed, install: state.install }),
}));
vi.mock('@/shared/hooks/useIsStandalone', () => ({ useIsStandalone: () => state.standalone }));
vi.mock('@/lib/telegram', () => ({ isTelegramWebApp: () => state.telegram }));

import { InstallBanner } from './InstallBanner';
import { INSTALL_BANNER_SNOOZED_AT_KEY } from './installBannerSnooze';

const IOS_SAFARI: InstallEnv = { os: 'ios', browser: 'safari', inApp: false };
const banner = () => document.querySelector('[data-install-banner]');

describe('InstallBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.assign(state, {
      env: IOS_SAFARI,
      canInstall: false,
      installed: false,
      standalone: false,
      telegram: false,
    });
    state.install.mockReset();
  });

  it('iPhone в Safari: «Как?» открывает шторку с шагами и подсказкой про повторный вход', () => {
    render(<InstallBanner />);
    expect(banner()).toBeInTheDocument();

    fireEvent.click(screen.getByText('Как?'));
    expect(screen.getByText('Как установить')).toBeInTheDocument();
    expect(screen.getByText('Нажмите «Поделиться»')).toBeInTheDocument();
    expect(screen.getByText(/войдите в приложении ещё раз/)).toBeInTheDocument();
  });

  it('Android с prompt: «Установить» ставит в один тап, без шторки', () => {
    state.env = { os: 'android', browser: 'chrome', inApp: false };
    state.canInstall = true;
    render(<InstallBanner />);

    fireEvent.click(screen.getByText('Установить'));
    expect(state.install).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Как установить')).not.toBeInTheDocument();
  });

  it('встроенный браузер мессенджера: шаги «открыть в браузере» и копирование ссылки', () => {
    state.env = { os: 'android', browser: 'chrome', inApp: true };
    state.canInstall = true; // в webview prompt'у не доверяем — ведём в браузер
    render(<InstallBanner />);

    expect(screen.getByText('Сначала откройте сайт в браузере')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Как?'));
    expect(screen.getByText('Выберите «Открыть в браузере»')).toBeInTheDocument();
    expect(screen.getByText('Скопировать ссылку')).toBeInTheDocument();
    expect(state.install).not.toHaveBeenCalled();
  });

  it('«Не сейчас» прячет плашку и запоминает время', () => {
    render(<InstallBanner />);
    fireEvent.click(screen.getByLabelText('Не сейчас'));
    expect(banner()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INSTALL_BANNER_SNOOZED_AT_KEY)).not.toBeNull();
  });

  it('недавно отложенная плашка не показывается', () => {
    window.localStorage.setItem(INSTALL_BANNER_SNOOZED_AT_KEY, String(Date.now()));
    render(<InstallBanner />);
    expect(banner()).not.toBeInTheDocument();
  });

  it.each([
    ['уже установлено и запущено с иконки', () => (state.standalone = true)],
    ['только что установлено', () => (state.installed = true)],
    ['Telegram mini-app', () => (state.telegram = true)],
    ['пререндер (окружение неизвестно)', () => (state.env = null)],
    ['десктоп без prompt', () => (state.env = { os: 'other', browser: 'chrome', inApp: false })],
  ])('скрыта: %s', (_name, arrange) => {
    arrange();
    render(<InstallBanner />);
    expect(banner()).not.toBeInTheDocument();
  });
});
