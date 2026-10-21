// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SongInkToolbar } from './SongInkToolbar';

function renderToolbar(overrides: Partial<React.ComponentProps<typeof SongInkToolbar>> = {}) {
  const props = {
    tool: 'pen' as const,
    color: 'ink',
    width: 3,
    canUndo: false,
    hasStrokes: true,
    onToolChange: vi.fn(),
    onColorChange: vi.fn(),
    onWidthChange: vi.fn(),
    onUndo: vi.fn(),
    onClearAll: vi.fn(),
    dirty: false,
    zoom: 1,
    onResetZoom: vi.fn(),
    onDone: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const view = render(<SongInkToolbar {...props} />);
  return { ...props, rerender: (next: Partial<typeof props>) => view.rerender(<SongInkToolbar {...props} {...next} />) };
}

describe('SongInkToolbar', () => {
  it('держит все инструменты и оба выхода в одной панели', () => {
    renderToolbar();
    const rail = document.querySelector('[data-song-ink-toolbar]');
    expect(rail).not.toBeNull();
    for (const tool of ['pen', 'highlighter', 'arrow', 'text', 'eraser']) {
      expect(rail?.querySelector(`[data-song-ink-tool="${tool}"]`)).not.toBeNull();
    }
    expect(rail?.querySelector('[data-song-ink-done]')).not.toBeNull();
    expect(rail?.querySelector('[data-song-ink-cancel]')).not.toBeNull();
  });

  it('карточка цвета и толщины открывается образцом и закрывается им же', () => {
    renderToolbar();
    expect(document.querySelector('[data-song-ink-style]')).toBeNull();
    fireEvent.click(screen.getByLabelText('Цвет и толщина'));
    expect(document.querySelector('[data-song-ink-palette]')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Цвет и толщина'));
    expect(document.querySelector('[data-song-ink-style]')).toBeNull();
  });

  it('у ластика стиля нет — образец выключен', () => {
    renderToolbar({ tool: 'eraser' });
    expect(screen.getByLabelText('Цвет и толщина')).toBeDisabled();
  });

  it('у текста вместо слайдера — дропдаун именованных кеглей', () => {
    const props = renderToolbar({ tool: 'text', width: 15 });
    fireEvent.click(screen.getByLabelText('Цвет и толщина'));

    expect(document.querySelector('[data-song-ink-width]')).toBeNull();
    const select = screen.getByLabelText('Размер текста') as HTMLSelectElement;
    expect(select.value).toBe('15');

    fireEvent.change(select, { target: { value: '26' } });
    expect(props.onWidthChange).toHaveBeenCalledWith(26);
  });

  it('заметка с произвольным кеглем показывает ближайший именованный', () => {
    renderToolbar({ tool: 'text', width: 28 });
    fireEvent.click(screen.getByLabelText('Цвет и толщина'));
    expect((screen.getByLabelText('Размер текста') as HTMLSelectElement).value).toBe('26');
  });

  it('«стереть всё» спрашивает подтверждение и только потом чистит', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByLabelText('Стереть все пометки'));
    expect(props.onClearAll).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-song-ink-confirm-accept]') as HTMLElement);
    expect(props.onClearAll).toHaveBeenCalledTimes(1);
  });
});

describe('SongInkToolbar — выходы и масштаб', () => {
  it('«Готово» сохраняет и выходит', () => {
    const props = renderToolbar();
    fireEvent.click(document.querySelector('[data-song-ink-done]') as HTMLElement);
    expect(props.onDone).toHaveBeenCalledTimes(1);
  });

  it('чип масштаба появляется только при зуме', () => {
    const props = renderToolbar();
    expect(document.querySelector('[data-song-ink-zoom-reset]')).toBeNull();
    props.rerender({ zoom: 1.5 });
    const chip = document.querySelector('[data-song-ink-zoom-reset]') as HTMLElement;
    expect(chip.textContent).toContain('×1.5');
    fireEvent.click(chip);
    expect(props.onResetZoom).toHaveBeenCalledTimes(1);
  });

  it('выход без правок не спрашивает подтверждения, с правками — спрашивает', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByLabelText('Выйти без сохранения'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);

    props.rerender({ dirty: true });
    fireEvent.click(screen.getByLabelText('Выйти без сохранения'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('[data-song-ink-confirm-accept]') as HTMLElement);
    expect(props.onCancel).toHaveBeenCalledTimes(2);
  });
});
