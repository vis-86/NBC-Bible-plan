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

function renderView(canManageSetlists: boolean, setlist: Setlist = SETLIST) {
  return render(<SetlistView setlist={setlist} canManageSetlists={canManageSetlists} songs={SONGS} />);
}

/** Открывает шит управления сетом — единственную точку правки состава. */
function openManageSheet() {
  fireEvent.click(document.querySelector('[data-setlist-view-manage]') as HTMLElement);
}

describe('SetlistView', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // navigator.onLine сбрасываем в дефолт между тестами (jsdom по умолчанию true).
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('рендерит название и список песен; без даты строка даты не рендерится', () => {
    renderView(false);
    expect(screen.getByText('Воскресное')).toBeTruthy();
    expect(document.querySelector('[data-setlist-view-date]')).toBeNull();
    expect(document.querySelectorAll('[data-setlist-view-item]')).toHaveLength(2);
  });

  it('дата рендерится, когда задана', () => {
    renderView(false, { ...SETLIST, date: '2026-08-02' });
    expect(document.querySelector('[data-setlist-view-date]')?.textContent).toBe('вс, 2 августа');
  });

  it('страница read-only: ни drag, ни крестиков — даже у musician', () => {
    renderView(true);
    expect(document.querySelector('[data-setlist-builder-reorder-list]')).toBeNull();
    expect(document.querySelector('[data-setlist-builder-item-remove]')).toBeNull();
  });

  it('у reader нет кнопки правки', () => {
    renderView(false);
    expect(document.querySelector('[data-setlist-view-manage]')).toBeNull();
  });

  it('тап по строке открывает песню в режиме сета', () => {
    renderView(false);
    fireEvent.click(document.querySelectorAll('[data-setlist-view-item]')[1] as HTMLElement);
    expect(pushMock).toHaveBeenCalledWith('/dashboard/song?id=2&setlistId=s1');
  });

  it('«Изменить сет» открывает шит с drag-списком и кнопками', () => {
    renderView(true);
    openManageSheet();
    expect(document.querySelector('[data-setlist-manage-sheet]')).toBeTruthy();
    expect(document.querySelector('[data-setlist-builder-reorder-list]')).toBeTruthy();
    expect(document.querySelector('[data-setlist-manage-sheet-add]')).toBeTruthy();
    expect(document.querySelector('[data-setlist-manage-sheet-delete]')).toBeTruthy();
  });

  it('удаление песни требует подтверждения и только потом шлёт PATCH', async () => {
    updateMock.mockResolvedValue(undefined);
    const { findByText } = renderView(true);
    openManageSheet();

    fireEvent.click(document.querySelectorAll('[data-setlist-builder-item-remove]')[0] as HTMLElement);
    expect(updateMock).not.toHaveBeenCalled();

    fireEvent.click(await findByText('Убрать'));

    await vi.waitFor(() => expect(updateMock).toHaveBeenCalledWith('s1', { songIds: [2] }));
    expect(document.querySelectorAll('[data-setlist-view-items] [data-setlist-view-item]')).toHaveLength(1);
  });

  it('провал PATCH откатывает состав и показывает ошибку', async () => {
    updateMock.mockRejectedValue(new Error('Сеть недоступна'));
    const { findByText } = renderView(true);
    openManageSheet();

    fireEvent.click(document.querySelectorAll('[data-setlist-builder-item-remove]')[0] as HTMLElement);
    fireEvent.click(await findByText('Убрать'));

    await vi.waitFor(() =>
      expect(document.querySelector('[data-setlist-manage-sheet-error]')?.textContent).toContain('Сеть недоступна')
    );
    // Откат: обе песни на месте, экран не врёт про состав, которого нет на сервере.
    expect(document.querySelectorAll('[data-setlist-view-items] [data-setlist-view-item]')).toHaveLength(2);
  });

  it('«Добавить песню» дописывает выбранное в конец и шлёт PATCH', async () => {
    updateMock.mockResolvedValue(undefined);
    renderView(true);
    openManageSheet();

    fireEvent.click(document.querySelector('[data-setlist-manage-sheet-add]') as HTMLElement);

    const addRow = Array.from(document.querySelectorAll('[data-setlist-builder-pick-row]')).find((el) =>
      el.textContent?.includes('Аллилуйя')
    ) as HTMLElement;
    fireEvent.click(addRow);
    fireEvent.click(document.querySelector('[data-add-songs-sheet-submit]') as HTMLElement);

    await vi.waitFor(() => expect(updateMock).toHaveBeenCalledWith('s1', { songIds: [1, 2, 3] }));
  });

  it('песни, уже входящие в сет, в шите не добавляются повторно', () => {
    renderView(true);
    openManageSheet();
    fireEvent.click(document.querySelector('[data-setlist-manage-sheet-add]') as HTMLElement);

    const existingRow = Array.from(document.querySelectorAll('[data-setlist-builder-pick-row]')).find((el) =>
      el.textContent?.includes('Господь мой пастырь')
    ) as HTMLElement;
    expect(existingRow.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(existingRow);
    expect((document.querySelector('[data-add-songs-sheet-submit]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('удаление сета требует подтверждения в Modal перед вызовом API', async () => {
    removeMock.mockResolvedValue(undefined);
    const { findByText } = renderView(true);
    openManageSheet();

    fireEvent.click(document.querySelector('[data-setlist-manage-sheet-delete]') as HTMLElement);
    expect(removeMock).not.toHaveBeenCalled();

    fireEvent.click(await findByText('Да, удалить'));

    await vi.waitFor(() => expect(removeMock).toHaveBeenCalledWith('s1'));
    await vi.waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/setlists'));
  });

  it('в офлайне правка недоступна: кнопки disabled, строки без drag/удаления', () => {
    renderView(true);
    openManageSheet();

    fireEvent(window, new Event('offline'));

    const addBtn = document.querySelector('[data-setlist-manage-sheet-add]') as HTMLButtonElement;
    const deleteBtn = document.querySelector('[data-setlist-manage-sheet-delete]') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    expect(deleteBtn.disabled).toBe(true);
    expect(addBtn.textContent).toContain('Нужен интернет');
    expect(document.querySelector('[data-setlist-builder-item-remove]')).toBeNull();
  });
});
