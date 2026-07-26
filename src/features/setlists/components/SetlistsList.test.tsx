// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { SetlistSummary } from '../types';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { SetlistsList } from './SetlistsList';

const TODAY = '2026-07-26';

function makeSetlist(overrides: Partial<SetlistSummary>): SetlistSummary {
  return { id: '1', title: 'Сет', date: null, items: [{ songId: 41, title: 'Придите все', songKey: 'Bb' }], ...overrides };
}

describe('SetlistsList', () => {
  it('пустой список: показывает "Сетов пока нет" и кнопку "Создать сет" только при праве', () => {
    const withRight = render(<SetlistsList setlists={[]} todayISO={TODAY} canManageSetlists={true} />);
    expect(withRight.container.querySelector('[data-setlists-empty]')).toBeTruthy();
    expect(withRight.container.querySelector('[data-setlists-create-button]')).toBeTruthy();
    withRight.unmount();

    const readerOnly = render(<SetlistsList setlists={[]} todayISO={TODAY} canManageSetlists={false} />);
    expect(readerOnly.container.querySelector('[data-setlists-create-button]')).toBeNull();
  });

  it('рендерит три секции: «Ближайшие», «Без даты», «Архив»', () => {
    const setlists = [
      makeSetlist({ id: 'past', title: 'Прошедший', date: '2020-01-01' }),
      makeSetlist({ id: 'future', title: 'Будущий', date: '2030-01-01' }),
      makeSetlist({ id: 'undated', title: 'Молодёжка', date: null }),
    ];
    const { container, getByText } = render(
      <SetlistsList setlists={setlists} todayISO={TODAY} canManageSetlists={false} />
    );

    expect(getByText('Ближайшие')).toBeTruthy();
    expect(getByText('Без даты')).toBeTruthy();
    expect(container.querySelector('[data-setlist-archive]')).toBeTruthy();
    expect(getByText('Архив (1)')).toBeTruthy();
    expect(container.querySelectorAll('[data-setlist-card]')).toHaveLength(3);
  });

  it('архив не рендерится, если прошедших сетов нет', () => {
    const setlists = [makeSetlist({ id: 'future', date: '2030-01-01' })];
    const { container } = render(<SetlistsList setlists={setlists} todayISO={TODAY} canManageSetlists={false} />);
    expect(container.querySelector('[data-setlist-archive]')).toBeNull();
  });
});
