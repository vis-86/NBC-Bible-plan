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

  it('пустой сет: открывать нечего — ведём на страницу сета', () => {
    const { container } = render(<SetlistCard setlist={{ ...SETLIST, items: [] }} />);
    expect(container.querySelector('[data-setlist-card-empty]')).toBeTruthy();

    fireEvent.click(container.querySelector('[data-setlist-card-header]') as HTMLElement);
    expect(pushMock).toHaveBeenCalledWith('/dashboard/setlist?id=s1');
  });
});
