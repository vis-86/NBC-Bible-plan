// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { AppShellNodeContext, useAppShellPortalTarget } from './AppShellNode';

function Overlay() {
  const target = useAppShellPortalTarget();
  return target ? createPortal(<div data-testid="overlay" />, target) : null;
}

describe('useAppShellPortalTarget', () => {
  it('отдаёт узел оболочки — оверлей живёт в её системе координат, а не вьюпорта', () => {
    const shell = document.createElement('div');
    shell.setAttribute('data-dashboard-layout', '');
    document.body.appendChild(shell);

    render(
      <AppShellNodeContext.Provider value={shell}>
        <Overlay />
      </AppShellNodeContext.Provider>
    );

    expect(shell.querySelector('[data-testid="overlay"]')).not.toBeNull();
  });

  it('вне дашборда (логин, лендинг) падает обратно в body', () => {
    render(<Overlay />);

    const overlay = screen.getByTestId('overlay');
    expect(overlay.parentElement).toBe(document.body);
  });
});
