// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SongSummary } from '@/features/songs/types';
import type { Setlist } from '../types';

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, prefetch: vi.fn() }),
}));

const { removeMock, updateMock } = vi.hoisted(() => ({ removeMock: vi.fn(), updateMock: vi.fn() }));
vi.mock('@/shared/services/api/endpoints', () => ({
  setlistsApi: { remove: removeMock, update: updateMock },
}));

import { SetlistView } from './SetlistView';

const SONGS: SongSummary[] = [
  { id: '1', title: 'Господь мой пастырь', key: 'G' },
  { id: '2', title: 'Свят, свят, свят' },
  { id: '3', title: 'Аллилуйя' },
];

const SETLIST: Setlist = {
  id: 's1',
  title: 'Воскресное',
  date: null,
  items: [
    { id: 'i1', sort: 0, songId: 1, title: 'Господь мой пастырь', songKey: 'G' },
    { id: 'i2', sort: 1, songId: 2, title: 'Свят, свят, свят' },
  ],
};

function renderView(canManageSetlists: boolean) {
  return render(<SetlistView setlist={SETLIST} canManageSetlists={canManageSetlists} songs={SONGS} />);
}

describe('SetlistView', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // navigator.onLine сбрасываем в дефолт между тестами (jsdom по умолчанию true).
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('рендерит название, дату и список песен по порядку', () => {
    const { container } = renderView(false);
    expect(screen.getByText('Воскресное')).toBeTruthy();
    expect(container.querySelectorAll('[data-setlist-view-item]')).toHaveLength(2);
    expect(screen.getByText('Господь мой пастырь')).toBeTruthy();
  });

  it('у reader нет ни правки состава, ни кнопок «Добавить»/«Удалить»', () => {
    const { container } = renderView(false);
    expect(container.querySelector('[data-setlist-view-add-song]')).toBeNull();
    expect(container.querySelector('[data-setlist-view-delete]')).toBeNull();
    // Строки не перетаскиваются и не удаляются.
    expect(container.querySelector('[data-setlist-builder-item-remove]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-reorder-list]')).toBeNull();
  });

  it('musician открывает песню тапом по строке', () => {
    const { container } = renderView(true);
    fireEvent.click(container.querySelectorAll('[data-setlist-view-item]')[1] as HTMLElement);
    expect(pushMock).toHaveBeenCalledWith('/dashboard/song?id=2&setlistId=s1');
  });

  it('в офлайне правка недоступна: кнопки disabled, строки без drag/удаления', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    const { container } = renderView(true);

    fireEvent(window, new Event('offline'));

    const addBtn = container.querySelector('[data-setlist-view-add-song]') as HTMLButtonElement;
    const deleteBtn = container.querySelector('[data-setlist-view-delete]') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    expect(deleteBtn.disabled).toBe(true);
    expect(addBtn.textContent).toContain('Нужен интернет');
    expect(container.querySelector('[data-setlist-builder-item-remove]')).toBeNull();
  });

  it('удаление песни шлёт PATCH с обновлённым songIds', async () => {
    updateMock.mockResolvedValue(undefined);
    const { container } = renderView(true);

    fireEvent.click(container.querySelectorAll('[data-setlist-builder-item-remove]')[0] as HTMLElement);

    await vi.waitFor(() => expect(updateMock).toHaveBeenCalledWith('s1', { songIds: [2] }));
    expect(container.querySelectorAll('[data-setlist-view-item]')).toHaveLength(1);
  });

  it('провал PATCH откатывает состав и показывает ошибку с возможностью повторить', async () => {
    updateMock.mockRejectedValue(new Error('Сеть недоступна'));
    const { container } = renderView(true);

    fireEvent.click(container.querySelectorAll('[data-setlist-builder-item-remove]')[0] as HTMLElement);

    await vi.waitFor(() =>
      expect(container.querySelector('[data-setlist-view-save-error]')?.textContent).toContain('Сеть недоступна')
    );
    // Откат: обе песни на месте, экран не врёт про состав, которого нет на сервере.
    expect(container.querySelectorAll('[data-setlist-view-item]')).toHaveLength(2);
  });

  it('«Добавить песню» дописывает выбранное в конец и шлёт PATCH', async () => {
    updateMock.mockResolvedValue(undefined);
    const { container } = renderView(true);

    fireEvent.click(container.querySelector('[data-setlist-view-add-song]') as HTMLElement);

    const addRow = Array.from(container.querySelectorAll('[data-setlist-builder-pick-row]')).find((el) =>
      el.textContent?.includes('Аллилуйя')
    ) as HTMLElement;
    fireEvent.click(addRow);
    fireEvent.click(container.querySelector('[data-add-songs-sheet-submit]') as HTMLElement);

    await vi.waitFor(() => expect(updateMock).toHaveBeenCalledWith('s1', { songIds: [1, 2, 3] }));
  });

  it('песни, уже входящие в сет, в шите не добавляются повторно', () => {
    const { container } = renderView(true);
    fireEvent.click(container.querySelector('[data-setlist-view-add-song]') as HTMLElement);

    const existingRow = Array.from(container.querySelectorAll('[data-setlist-builder-pick-row]')).find((el) =>
      el.textContent?.includes('Господь мой пастырь')
    ) as HTMLElement;
    expect(existingRow.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(existingRow);
    expect((container.querySelector('[data-add-songs-sheet-submit]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('удаление сета требует подтверждения в Modal перед вызовом API', async () => {
    removeMock.mockResolvedValue(undefined);
    const { container, findByText } = renderView(true);

    fireEvent.click(container.querySelector('[data-setlist-view-delete]') as HTMLElement);
    expect(removeMock).not.toHaveBeenCalled();

    const confirmBtn = await findByText('Да, удалить');
    fireEvent.click(confirmBtn);

    await vi.waitFor(() => expect(removeMock).toHaveBeenCalledWith('s1'));
    await vi.waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/setlists'));
  });
});
