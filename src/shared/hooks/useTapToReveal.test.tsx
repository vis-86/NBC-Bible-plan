// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { useTapToReveal } from './useTapToReveal';

/**
 * Тап отличается от скролла тремя условиями сразу (сдвиг, длительность, изменение
 * scrollTop) — каждое из них проверяется отдельно, иначе «возврат хрома по тапу»
 * срабатывал бы на обычной прокрутке.
 */

function Harness({ onReveal, enabled = true }: { onReveal: () => void; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useTapToReveal(ref, onReveal, { enabled });
  return (
    <div ref={ref} data-target style={{ height: 100 }}>
      <button type="button">кнопка</button>
      <span data-text>текст</span>
    </div>
  );
}

function tap(el: Element, opts: Partial<{ dx: number; dy: number; dt: number; target: Element }> = {}) {
  const { dx = 0, dy = 0, dt = 50, target = el } = opts;
  // Длительность жеста задаём через performance.now() — хук меряет ею, а timeStamp
  // события jsdom не даёт подменить.
  const now = vi.spyOn(performance, 'now');
  now.mockReturnValue(0);
  fireEvent.pointerDown(el, { clientX: 100, clientY: 100, isPrimary: true });
  now.mockReturnValue(dt);
  fireEvent.pointerUp(target, { clientX: 100 + dx, clientY: 100 + dy, isPrimary: true });
  now.mockRestore();
}

describe('useTapToReveal', () => {
  it('короткий тап без сдвига вызывает onReveal', () => {
    const onReveal = vi.fn();
    const { container } = render(<Harness onReveal={onReveal} />);
    tap(container.querySelector('[data-target]') as Element);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('сдвиг пальца (скролл/свайп) не считается тапом', () => {
    const onReveal = vi.fn();
    const { container } = render(<Harness onReveal={onReveal} />);
    tap(container.querySelector('[data-target]') as Element, { dy: 40 });
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('удержание не считается тапом', () => {
    const onReveal = vi.fn();
    const { container } = render(<Harness onReveal={onReveal} />);
    tap(container.querySelector('[data-target]') as Element, { dt: 900 });
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('тап, погасивший инерцию прокрутки (scrollTop уехал), не считается тапом', () => {
    const onReveal = vi.fn();
    const { container } = render(<Harness onReveal={onReveal} />);
    const el = container.querySelector('[data-target]') as HTMLElement;
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100, isPrimary: true, timeStamp: 0 });
    el.scrollTop = 120;
    fireEvent.pointerUp(el, { clientX: 100, clientY: 100, isPrimary: true, timeStamp: 50 });
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('тап по интерактивному элементу не возвращает хром (у кнопки своё действие)', () => {
    const onReveal = vi.fn();
    const { container } = render(<Harness onReveal={onReveal} />);
    const el = container.querySelector('[data-target]') as Element;
    tap(el, { target: container.querySelector('button') as Element });
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('enabled: false полностью отключает распознавание', () => {
    const onReveal = vi.fn();
    const { container } = render(<Harness onReveal={onReveal} enabled={false} />);
    tap(container.querySelector('[data-target]') as Element);
    expect(onReveal).not.toHaveBeenCalled();
  });
});
