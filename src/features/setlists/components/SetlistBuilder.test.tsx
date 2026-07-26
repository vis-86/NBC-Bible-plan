// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SongSummary } from '@/features/songs/types';
import type { Setlist } from '../types';

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, prefetch: vi.fn() }),
}));

let matchesWide = false;
vi.mock('@/shared/hooks/useMediaQuery', () => ({
  useMediaQuery: () => matchesWide,
}));

vi.mock('@/features/setlists/lib/offlineSetlists', () => ({
  setlistCacheKey: (id: string) => `setlists:item:${id}`,
  SETLISTS_LIST_CACHE_KEY: 'setlists:list',
}));

vi.mock('@/shared/offline/db', () => ({
  getDB: async () => ({ delete: vi.fn() }),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  setlistsApi: { create: vi.fn(), update: vi.fn() },
}));

import { SetlistBuilder } from './SetlistBuilder';

const SONGS: SongSummary[] = [
  { id: '1', title: 'Господь мой пастырь', key: 'G' },
  { id: '2', title: 'Свят, свят, свят' },
  { id: '3', title: 'Аллилуйя' },
];

function pickRow(container: Element, title: string): HTMLElement {
  return Array.from(container.querySelectorAll('[data-setlist-builder-pick-row]')).find((el) =>
    el.textContent?.includes(title)
  ) as HTMLElement;
}

describe('SetlistBuilder', () => {
  beforeEach(() => {
    sessionStorage.clear();
    matchesWide = false;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('тап по строке добавляет chip и ставит aria-selected', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    const row = pickRow(container, 'Господь мой пастырь');
    expect(row.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(row);

    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-setlist-builder-chip]')).toBeTruthy();
    expect(screen.getByText('Выбрано: 1')).toBeTruthy();
  });

  it('✕ на chip снимает выбор и синхронно снимает галку в списке', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));
    expect(container.querySelectorAll('[data-setlist-builder-chip]')).toHaveLength(1);

    fireEvent.click(container.querySelector('[data-setlist-builder-chip]') as HTMLElement);

    expect(container.querySelectorAll('[data-setlist-builder-chip]')).toHaveLength(0);
    expect(pickRow(container, 'Аллилуйя').getAttribute('aria-selected')).toBe('false');
  });

  it('FAB «Далее» disabled при N=0, активен при N≥1', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    const fab = container.querySelector('[data-setlist-builder-next]') as HTMLButtonElement;
    expect(fab.disabled).toBe(true);

    fireEvent.click(pickRow(container, 'Свят'));
    expect(fab.disabled).toBe(false);
  });

  it('битый JSON в sessionStorage не роняет экран билдера', () => {
    sessionStorage.setItem('setlists:draft', '{broken');
    expect(() => render(<SetlistBuilder songs={SONGS} />)).not.toThrow();
  });

  it('кнопки «Вверх»/«Вниз» меняют порядок, disabled на границах (в режиме редактирования)', () => {
    const setlist: Setlist = {
      id: 's1',
      title: 'Существующий',
      date: null,
      items: [
        { id: 'i1', sort: 0, songId: 1, title: 'Господь мой пастырь' },
        { id: 'i2', sort: 1, songId: 2, title: 'Свят, свят, свят' },
      ],
    };
    const { container } = render(<SetlistBuilder songs={SONGS} editingId="s1" initialSetlist={setlist} />);

    const upButtons = container.querySelectorAll('[data-setlist-builder-item-up]');
    const downButtons = container.querySelectorAll('[data-setlist-builder-item-down]');
    expect((upButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((downButtons[1] as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(downButtons[0]);
    const items = container.querySelectorAll('[data-setlist-builder-item]');
    expect(items[0].textContent).toContain('Свят, свят, свят');
    expect(items[1].textContent).toContain('Господь мой пастырь');
  });

  it('редактирование существующего сета предзаполняет выбор/название/дату', () => {
    const setlist: Setlist = {
      id: 's1',
      title: 'Существующий',
      date: '2026-08-01',
      items: [{ id: 'i1', sort: 0, songId: 2, title: 'Свят, свят, свят' }],
    };
    const { container } = render(<SetlistBuilder songs={SONGS} editingId="s1" initialSetlist={setlist} />);

    expect(screen.getByText('Выбрано: 1')).toBeTruthy();
    expect(pickRow(container, 'Свят').getAttribute('aria-selected')).toBe('true');

    // Название/дата на мобильном живут в NameSetlistSheet — открываем его через FAB.
    fireEvent.click(container.querySelector('[data-setlist-builder-next]') as HTMLElement);
    expect((container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement).value).toBe(
      'Существующий'
    );
    expect((container.querySelector('[data-setlist-builder-date-input]') as HTMLInputElement).value).toBe(
      '2026-08-01'
    );
  });

  it('широкий layout (≥768px): рендерит панель, не рендерит FAB/шапку с ✕', () => {
    matchesWide = true;
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    expect(container.querySelector('[data-setlist-builder-next]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-cancel]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-submit-desktop]')).toBeTruthy();
  });

  it('переключение ширины не теряет выбор (черновик общий для обоих режимов)', () => {
    const { container, rerender } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));

    matchesWide = true;
    rerender(<SetlistBuilder songs={SONGS} />);

    // Desktop-панель показывает reorder-список с той же выбранной песней.
    expect(container.querySelectorAll('[data-setlist-builder-item]')).toHaveLength(1);
    expect(container.querySelector('[data-setlist-builder-item]')?.textContent).toContain('Аллилуйя');

    fireEvent.change(container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement, {
      target: { value: 'Молодёжка' },
    });
    expect((container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement).value).toBe(
      'Молодёжка'
    );
  });
});
