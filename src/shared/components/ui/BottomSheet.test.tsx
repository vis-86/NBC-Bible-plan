// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
  it('ничего не рендерит, когда закрыт', () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()}>
        <div>Контент</div>
      </BottomSheet>
    );
    expect(screen.queryByText('Контент')).not.toBeInTheDocument();
  });

  it('рендерит контент, когда открыт', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()}>
        <div>Контент</div>
      </BottomSheet>
    );
    expect(screen.getByText('Контент')).toBeInTheDocument();
  });

  it('body получает нижний safe-area padding — кнопки не прячутся под home-indicator', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()}>
        <div>Контент</div>
      </BottomSheet>
    );
    const body = document.querySelector('[data-bottom-sheet-body]');
    expect(body?.className).toContain('pb-[max(0.75rem,env(safe-area-inset-bottom))]');
  });

  it('вызывает onClose по клику на overlay и по крестику', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen onClose={onClose} title="Заголовок">
        <div>Контент</div>
      </BottomSheet>
    );
    fireEvent.click(document.querySelector('[data-bottom-sheet-overlay]')!);
    fireEvent.click(document.querySelector('[data-bottom-sheet-close-button]')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('кнопка закрытия имеет тап-зону 44x44 (h-11 w-11)', () => {
    render(
      <BottomSheet isOpen onClose={vi.fn()} title="Заголовок">
        <div>Контент</div>
      </BottomSheet>
    );
    const closeButton = document.querySelector('[data-bottom-sheet-close-button]');
    expect(closeButton?.className).toContain('h-11');
    expect(closeButton?.className).toContain('w-11');
  });
});
