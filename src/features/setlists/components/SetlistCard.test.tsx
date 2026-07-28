// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { SetlistSummary } from '../types';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { SetlistCard } from './SetlistCard';

const SETLIST: SetlistSummary = {
  id: 's1',
  title: 'Вск. Служение',
  date: '2026-08-02',
  items: [
    { songId: 41, title: 'Придите все к Воскресшему', songKey: 'Bb' },
    { songId: 70, title: 'От небесных вершин', songKey: 'A' },
  ],
};

describe('SetlistCard', () => {
  afterEach(() => vi.clearAllMocks());

  it('показывает состав сразу: номер по порядку, #id песни, название и тональность', () => {
    const { container } = render(<SetlistCard setlist={SETLIST} />);
    const rows = container.querySelectorAll('[data-setlist-card-song]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('#41');
    expect(rows[0].textContent).toContain('Придите все к Воскресшему');
    expect(rows[0].textContent).toContain('Bb');
    expect(container.querySelector('[data-setlist-card-date]')?.textContent).toBe('вс, 2 августа');
  });

  it('без даты строка даты не рендерится', () => {
    const { container } = render(<SetlistCard setlist={{ ...SETLIST, date: null }} />);
    expect(container.querySelector('[data-setlist-card-date]')).toBeNull();
  });

  it('тап по шапке открывает первую песню сета, тап по строке — свою', () => {
    const { container } = render(<SetlistCard setlist={SETLIST} />);

    fireEvent.click(container.querySelector('[data-setlist-card-header]') as HTMLElement);
    expect(pushMock).toHaveBeenCalledWith('/dashboard/song?id=41&setlistId=s1');

    fireEvent.click(container.querySelectorAll('[data-setlist-card-song]')[1] as HTMLElement);
    expect(pushMock).toHaveBeenLastCalledWith('/dashboard/song?id=70&setlistId=s1');
  });

  it('без обработчиков меню действий не рендерится (роль «Чтец»)', () => {
    const { container } = render(<SetlistCard setlist={SETLIST} />);
    expect(container.querySelector('[data-setlist-card-actions]')).toBeNull();
    expect(container.querySelector('[data-action-menu-trigger]')).toBeNull();
  });

  it('многоточие раскрывает меню; «Изменить»/«Удалить» зовут свой обработчик и НЕ открывают сет', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(<SetlistCard setlist={SETLIST} onEdit={onEdit} onDelete={onDelete} />);

    // До клика по многоточию пунктов меню в DOM нет.
    expect(document.querySelector('[data-action-menu]')).toBeNull();

    fireEvent.click(container.querySelector('[data-action-menu-trigger]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-action-menu-item="edit"]') as HTMLElement);
    expect(onEdit).toHaveBeenCalledWith(SETLIST);

    fireEvent.click(container.querySelector('[data-action-menu-trigger]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-action-menu-item="delete"]') as HTMLElement);
    expect(onDelete).toHaveBeenCalledWith(SETLIST);

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('только onEdit → в меню один пункт «Изменить»', () => {
    const { container } = render(<SetlistCard setlist={SETLIST} onEdit={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-action-menu-trigger]') as HTMLElement);

    expect(document.querySelectorAll('[data-action-menu-item]')).toHaveLength(1);
    expect(document.querySelector('[data-action-menu-item="delete"]')).toBeNull();
  });

  it('меню действий — сосед шапки, а не вложенная кнопка', () => {
    const { container } = render(<SetlistCard setlist={SETLIST} onEdit={vi.fn()} onDelete={vi.fn()} />);
    const header = container.querySelector('[data-setlist-card-header]') as HTMLElement;
    expect(header.querySelector('button')).toBeNull();
  });

  it('пустой сет: открывать нечего — ведём на страницу сета', () => {
    const { container } = render(<SetlistCard setlist={{ ...SETLIST, items: [] }} />);
    expect(container.querySelector('[data-setlist-card-empty]')).toBeTruthy();

    fireEvent.click(container.querySelector('[data-setlist-card-header]') as HTMLElement);
    expect(pushMock).toHaveBeenCalledWith('/dashboard/setlist?id=s1');
  });
});
