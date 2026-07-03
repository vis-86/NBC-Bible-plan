// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineIndicator } from './OfflineIndicator';

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

describe('OfflineIndicator', () => {
  const originalOnLine = window.navigator.onLine;

  afterEach(() => {
    setOnLine(originalOnLine);
  });

  it('ничего не рендерит, когда есть сеть', () => {
    setOnLine(true);
    render(<OfflineIndicator />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('показывает баннер, если navigator.onLine изначально false', () => {
    setOnLine(false);
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Офлайн');
  });

  it('показывает баннер по событию offline и скрывает по online — не блокируя остальной контент', () => {
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
});
