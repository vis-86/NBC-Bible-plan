// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SongInkToolbar } from './SongInkToolbar';
import { SongInkModeBar } from './SongInkModeBar';

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
    ...overrides,
  };
  render(<SongInkToolbar {...props} />);
  return props;
}

describe('SongInkToolbar', () => {
  it('рисует все инструменты одним вертикальным рельсом', () => {
    renderToolbar();
    const rail = document.querySelector('[data-song-ink-toolbar]');
    expect(rail).not.toBeNull();
    for (const tool of ['pen', 'highlighter', 'arrow', 'text', 'eraser']) {
      expect(rail?.querySelector(`[data-song-ink-tool="${tool}"]`)).not.toBeNull();
    }
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

describe('SongInkModeBar', () => {
  const base = {
    tool: 'highlighter' as const,
    color: '#dc2626',
    dirty: false,
    zoom: 1,
    onResetZoom: vi.fn(),
    onDone: vi.fn(),
    onCancel: vi.fn(),
  };

  it('показывает название инструмента и цвет', () => {
    render(<SongInkModeBar {...base} />);
    expect(document.querySelector('[data-song-ink-modebar-tool]')?.textContent).toBe('Маркер');
    expect((document.querySelector('[data-song-ink-modebar-color]') as HTMLElement).style.backgroundColor).toBe(
      'rgb(220, 38, 38)'
    );
  });

  it('чип масштаба появляется только при зуме', () => {
    const { rerender } = render(<SongInkModeBar {...base} />);
    expect(document.querySelector('[data-song-ink-zoom-reset]')).toBeNull();
    rerender(<SongInkModeBar {...base} zoom={1.5} />);
    expect(document.querySelector('[data-song-ink-zoom-reset]')?.textContent).toContain('×1.5');
  });

  it('выход без правок не спрашивает подтверждения, с правками — спрашивает', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<SongInkModeBar {...base} onCancel={onCancel} />);
    fireEvent.click(screen.getByLabelText('Выйти без сохранения'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<SongInkModeBar {...base} dirty onCancel={onCancel} />);
    fireEvent.click(screen.getByLabelText('Выйти без сохранения'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('[data-song-ink-confirm-accept]') as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
