// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChromeVisibilityProvider, useChromeVisibility } from './ChromeVisibility';

function Probe() {
  const { chromeHidden, setChromeHidden } = useChromeVisibility();
  return (
    <div>
      <span data-testid="chrome-hidden-value">{String(chromeHidden)}</span>
      <button onClick={() => setChromeHidden(true)}>hide</button>
      <button onClick={() => setChromeHidden(false)}>show</button>
    </div>
  );
}

describe('ChromeVisibility', () => {
  it('дефолт — chromeHidden: false', () => {
    render(
      <ChromeVisibilityProvider>
        <Probe />
      </ChromeVisibilityProvider>
    );
    expect(screen.getByTestId('chrome-hidden-value')).toHaveTextContent('false');
  });

  it('setChromeHidden обновляет значение для всех потребителей', () => {
    render(
      <ChromeVisibilityProvider>
        <Probe />
      </ChromeVisibilityProvider>
    );
    fireEvent.click(screen.getByText('hide'));
    expect(screen.getByTestId('chrome-hidden-value')).toHaveTextContent('true');

    fireEvent.click(screen.getByText('show'));
    expect(screen.getByTestId('chrome-hidden-value')).toHaveTextContent('false');
  });

  it('useChromeVisibility вне провайдера бросает ошибку', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useChromeVisibility must be used within a ChromeVisibilityProvider');
    errorSpy.mockRestore();
  });
});
