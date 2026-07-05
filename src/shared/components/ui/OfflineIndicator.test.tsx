// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { OfflineIndicator } from './OfflineIndicator';

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

function queryBanner() {
  return document.querySelector('[data-offline-indicator-banner]');
}

function queryPill() {
  return document.querySelector('[data-offline-indicator-pill]');
}

describe('OfflineIndicator', () => {
  const originalOnLine = window.navigator.onLine;

  beforeEach(() => {
    // «Один раз за сессию» живёт в sessionStorage — изолируем тесты друг от друга.
    window.sessionStorage.clear();
  });

  afterEach(() => {
    setOnLine(originalOnLine);
  });

  it('ничего не рендерит, когда есть сеть', () => {
    setOnLine(true);
    render(<OfflineIndicator />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('показывает полный баннер, если navigator.onLine изначально false', () => {
    setOnLine(false);
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Офлайн');
    expect(queryBanner()).not.toBeNull();
    expect(queryPill()).toBeNull();
  });

  it('показывает баннер по событию offline и скрывает всё по online — не блокируя остальной контент', () => {
    setOnLine(true);
    render(
      <div>
        <OfflineIndicator />
        <button>Начать чтение</button>
      </div>
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать чтение' })).toBeEnabled();

    setOnLine(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Офлайн');
    // Баннер не должен мешать остальному UI
    expect(screen.getByRole('button', { name: 'Начать чтение' })).toBeEnabled();

    setOnLine(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('по кнопке «Скрыть» баннер сменяется компактным пиллом, пока офлайн', () => {
    setOnLine(false);
    render(<OfflineIndicator />);
    expect(queryBanner()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Скрыть уведомление' }));
    expect(queryBanner()).toBeNull();
    expect(queryPill()).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Офлайн');
    // У пилла нет крестика
    expect(screen.queryByRole('button', { name: 'Скрыть уведомление' })).not.toBeInTheDocument();
  });

  it('пилл исчезает при восстановлении сети', () => {
    setOnLine(false);
    render(<OfflineIndicator />);
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть уведомление' }));
    expect(queryPill()).not.toBeNull();

    setOnLine(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('повторный переход в офлайн в той же сессии показывает сразу пилл, без баннера', () => {
    setOnLine(false);
    render(<OfflineIndicator />);
    expect(queryBanner()).not.toBeNull();

    // вернулась сеть...
    setOnLine(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // ...и снова пропала — сообщение уже показывали, теперь только пилл
    setOnLine(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(queryBanner()).toBeNull();
    expect(queryPill()).not.toBeNull();
  });

  it('после ремаунта (клиентская навигация) баннер не показывается повторно', () => {
    setOnLine(false);
    const { unmount } = render(<OfflineIndicator />);
    expect(queryBanner()).not.toBeNull();
    unmount();

    render(<OfflineIndicator />);
    expect(queryBanner()).toBeNull();
    expect(queryPill()).not.toBeNull();
  });
});
