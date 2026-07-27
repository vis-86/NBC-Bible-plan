// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { RangeSlider } from './RangeSlider';

describe('RangeSlider', () => {
  it('рендерит input[type=range] с переданными value/min/max', () => {
    const { container } = render(<RangeSlider value={17} min={12} max={32} onChange={vi.fn()} />);
    const input = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('17');
    expect(input.min).toBe('12');
    expect(input.max).toBe('32');
  });

  it('onChange отдаёт число, а не строку', () => {
    const onChange = vi.fn();
    const { container } = render(<RangeSlider value={17} min={12} max={32} onChange={onChange} />);
    const input = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '20' } });
    expect(onChange).toHaveBeenCalledWith(20);
    expect(typeof onChange.mock.calls[0][0]).toBe('number');
  });

  it('disabled помечает input как недоступный для взаимодействия', () => {
    // Реальные браузеры не шлют change/input событий на disabled-элементах —
    // fireEvent обходит это ограничение, поэтому гарантия проверяется через атрибут.
    const { container } = render(<RangeSlider value={17} min={12} max={32} disabled onChange={vi.fn()} />);
    const input = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('корневой элемент имеет класс min-h-11 — тап-зона 44px', () => {
    const { container } = render(<RangeSlider value={17} min={12} max={32} onChange={vi.fn()} />);
    expect(container.firstElementChild?.className).toContain('min-h-11');
  });
});
