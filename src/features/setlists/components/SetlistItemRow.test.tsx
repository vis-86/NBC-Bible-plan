// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { SetlistReorderList } from './SetlistReorderList';

const ITEMS = [
  { id: 1, title: 'Аллилуйя', subtitle: 'Hallelujah', songKey: 'G' },
  { id: 2, title: 'Свят, свят, свят' },
];

describe('SetlistItemRow / SetlistReorderList', () => {
  it('стрелок «Вверх»/«Вниз» больше нет — порядок только drag\'ом', () => {
    const { container } = render(<SetlistReorderList items={ITEMS} onReorder={vi.fn()} onRemove={vi.fn()} />);
    expect(container.querySelector('[data-setlist-builder-item-up]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-item-down]')).toBeNull();
    expect(container.querySelectorAll('[data-setlist-builder-item]')).toHaveLength(2);
  });

  it('крестик убирает песню по её id', () => {
    const onRemove = vi.fn();
    const { container } = render(<SetlistReorderList items={ITEMS} onReorder={vi.fn()} onRemove={onRemove} />);
    fireEvent.click(container.querySelectorAll('[data-setlist-builder-item-remove]')[1] as HTMLElement);
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('обычный тап по названию открывает песню', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <SetlistReorderList items={ITEMS} onReorder={vi.fn()} onRemove={vi.fn()} onOpen={onOpen} />
    );
    fireEvent.click(container.querySelectorAll('[data-setlist-view-item]')[0] as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('drag стартует только с ручки: строка не забирает тач у скролла', () => {
    const { container } = render(<SetlistReorderList items={ITEMS} onReorder={vi.fn()} onRemove={vi.fn()} />);
    const row = container.querySelector('[data-setlist-builder-item]') as HTMLElement;
    const handle = row.querySelector('[data-setlist-builder-item-handle]') as HTMLElement;

    expect(row.style.touchAction).toBe('');
    expect(row.getAttribute('role')).toBeNull();
    // Именно inline: класс проигрывает глобальному `button { touch-action: manipulation }`.
    expect(handle.style.touchAction).toBe('none');
    expect(handle.getAttribute('aria-roledescription')).toBe('sortable');
  });

  it('протяжка по строке не тащит песню, протяжка за ручку — тащит', () => {
    const { container } = render(<SetlistReorderList items={ITEMS} onReorder={vi.fn()} onRemove={vi.fn()} />);
    const row = container.querySelector('[data-setlist-builder-item]') as HTMLElement;
    const title = row.querySelector('[data-setlist-view-item]') ?? row.querySelector('p');
    const handle = row.querySelector('[data-setlist-builder-item-handle]') as HTMLElement;

    const drag = (el: Element) => {
      act(() => {
        fireEvent.pointerDown(el, { isPrimary: true, button: 0, clientX: 10, clientY: 10 });
      });
      act(() => {
        fireEvent.pointerMove(document, { isPrimary: true, clientX: 10, clientY: 60 });
      });
    };

    drag(title as Element);
    expect(row.className).not.toContain('shadow-app-lg');

    drag(handle);
    expect(row.className).toContain('shadow-app-lg');
  });

  it('editable=false: без drag-группы, ручки и крестика', () => {
    const { container } = render(<SetlistReorderList items={ITEMS} editable={false} onOpen={vi.fn()} />);
    expect(container.querySelector('[data-setlist-builder-reorder-list]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-item-handle]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-item-remove]')).toBeNull();
    expect(container.querySelector('[data-setlist-view-items]')).toBeTruthy();
  });

  it('подзаголовок и тональность показываются в обоих режимах', () => {
    const editable = render(<SetlistReorderList items={ITEMS} onReorder={vi.fn()} onRemove={vi.fn()} />);
    expect(editable.container.textContent).toContain('Hallelujah');
    expect(editable.container.textContent).toContain('G');

    const readonly = render(<SetlistReorderList items={ITEMS} editable={false} />);
    expect(readonly.container.textContent).toContain('Hallelujah');
    expect(readonly.container.textContent).toContain('G');
  });

  it('пустой список ничего не рендерит', () => {
    const { container } = render(<SetlistReorderList items={[]} onReorder={vi.fn()} onRemove={vi.fn()} />);
    expect(container.querySelector('[data-setlist-builder-item]')).toBeNull();
  });
});
