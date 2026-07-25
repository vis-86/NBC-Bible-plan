// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SongKeyPicker } from './SongKeyPicker';

const OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function renderPicker(props: Partial<React.ComponentProps<typeof SongKeyPicker>> = {}) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const onCapoChange = vi.fn();
  const utils = render(
    <SongKeyPicker
      value="G"
      source="original"
      originalKey="G"
      options={OPTIONS}
      onChange={onChange}
      onReset={onReset}
      capo={0}
      onCapoChange={onCapoChange}
      shapeKey="G"
      {...props}
    />,
  );
  const open = () => fireEvent.click(utils.container.querySelector('[data-song-key-picker-toggle]') as HTMLElement);
  return { ...utils, onChange, onReset, onCapoChange, open };
}

describe('SongKeyPicker — триггер', () => {
  it('показывает действующую тональность и подпись источника', () => {
    const personal = renderPicker({ value: 'Ab', source: 'personal' });
    expect(personal.container.querySelector('[data-song-key-picker-value]')?.textContent).toBe('Ab');
    expect(personal.container.querySelector('[data-song-key-picker-toggle]')?.textContent).toContain('моя');
    personal.unmount();

    const byDefault = renderPicker({ value: 'A', source: 'default' });
    expect(byDefault.container.querySelector('[data-song-key-picker-toggle]')?.textContent).toContain('по умолчанию');
  });

  it('для исходной тональности подписи источника нет', () => {
    const { container } = renderPicker({ value: 'G', source: 'original' });
    expect(container.querySelector('[data-song-key-picker-toggle]')?.textContent).toBe('G');
  });

  it('панель раскрывается по кнопке', () => {
    const picker = renderPicker();
    expect(document.querySelector('[data-song-key-picker-panel]')).toBeNull();
    picker.open();
    expect(document.querySelector('[data-song-key-picker-panel]')).not.toBeNull();
  });
});

describe('SongKeyPicker — выбор тональности', () => {
  it('выбор основы вызывает onChange с нормализованным ключом', () => {
    const picker = renderPicker({ value: 'G' });
    picker.open();
    fireEvent.click(screen.getByRole('button', { name: 'A', pressed: false }));
    expect(picker.onChange).toHaveBeenCalledWith('A');
  });

  it('смена знака нормализует энгармонику (D + ♭ → C#)', () => {
    const picker = renderPicker({ value: 'D' });
    picker.open();
    fireEvent.click(screen.getByRole('button', { name: 'Бемоль' }));
    expect(picker.onChange).toHaveBeenCalledWith('C#');
  });

  it('слайдер полутонов сдвигает от исходной тональности', () => {
    const picker = renderPicker({ value: 'G', originalKey: 'G' });
    picker.open();
    fireEvent.change(picker.container.querySelector('[data-song-key-picker-semitone-slider]') as HTMLElement, {
      target: { value: '2' },
    });
    expect(picker.onChange).toHaveBeenCalledWith('A');
  });

  it('«сбросить» видна только при личной тональности', () => {
    const original = renderPicker({ source: 'original' });
    original.open();
    expect(document.querySelector('[data-song-key-picker-reset]')).toBeNull();
    original.unmount();

    const personal = renderPicker({ source: 'personal' });
    personal.open();
    const reset = document.querySelector('[data-song-key-picker-reset]');
    expect(reset).not.toBeNull();
    fireEvent.click(reset as HTMLElement);
    expect(personal.onReset).toHaveBeenCalledTimes(1);
  });
});

describe('SongKeyPicker — каподастр', () => {
  it('слайдер капо вызывает onCapoChange', () => {
    const picker = renderPicker();
    picker.open();
    fireEvent.change(picker.container.querySelector('[data-song-key-picker-capo-slider]') as HTMLElement, {
      target: { value: '2' },
    });
    expect(picker.onCapoChange).toHaveBeenCalledWith(2);
  });

  it('при капо подпись содержит номер лада и форму', () => {
    const picker = renderPicker({ capo: 2, shapeKey: 'G', value: 'A' });
    picker.open();
    const label = document.querySelector('[data-song-key-picker-capo-label]')?.textContent ?? '';
    expect(label).toContain('2');
    expect(label).toContain('ладу');
    expect(label).toContain('G');
  });

  it('без капо подписи «играйте как в» нет', () => {
    const picker = renderPicker({ capo: 0 });
    picker.open();
    const label = document.querySelector('[data-song-key-picker-capo-label]')?.textContent ?? '';
    expect(label).toBe('Каподастр');
  });
});
