// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Setlist } from '../types';

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, prefetch: vi.fn() }),
}));

const { removeMock } = vi.hoisted(() => ({ removeMock: vi.fn() }));
vi.mock('@/shared/services/api/endpoints', () => ({
  setlistsApi: { remove: removeMock },
}));

import { SetlistView } from './SetlistView';

const SETLIST: Setlist = {
  id: 's1',
  title: 'Воскресное',
  date: null,
  items: [
    { id: 'i1', sort: 0, songId: 1, title: 'Господь мой пастырь', songKey: 'G' },
    { id: 'i2', sort: 1, songId: 2, title: 'Свят, свят, свят' },
  ],
};

describe('SetlistView', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // navigator.onLine сбрасываем в дефолт между тестами (jsdom по умолчанию true).
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('рендерит название, дату и список песен по порядку', () => {
    const { container } = render(<SetlistView setlist={SETLIST} canManageSetlists={false} />);
    expect(screen.getByText('Воскресное')).toBeTruthy();
    expect(container.querySelectorAll('[data-setlist-view-item]')).toHaveLength(2);
    expect(screen.getByText('Господь мой пастырь')).toBeTruthy();
  });

  it('у reader нет кнопок «Изменить»/«Удалить»', () => {
    const { container } = render(<SetlistView setlist={SETLIST} canManageSetlists={false} />);
    expect(container.querySelector('[data-setlist-view-edit]')).toBeNull();
    expect(container.querySelector('[data-setlist-view-delete]')).toBeNull();
  });

  it('в офлайне кнопки записи disabled и с подписью «Нужен интернет»', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    const { container } = render(<SetlistView setlist={SETLIST} canManageSetlists={true} />);

    fireEvent(window, new Event('offline'));

    const editBtn = container.querySelector('[data-setlist-view-edit]') as HTMLButtonElement;
    const deleteBtn = container.querySelector('[data-setlist-view-delete]') as HTMLButtonElement;
    expect(editBtn.disabled).toBe(true);
    expect(deleteBtn.disabled).toBe(true);
    expect(editBtn.textContent).toContain('Нужен интернет');
  });

  it('удаление требует подтверждения в Modal перед вызовом API', async () => {
    removeMock.mockResolvedValue(undefined);
    const { container, findByText } = render(<SetlistView setlist={SETLIST} canManageSetlists={true} />);

    fireEvent.click(container.querySelector('[data-setlist-view-delete]') as HTMLElement);
    expect(removeMock).not.toHaveBeenCalled();

    const confirmBtn = await findByText('Да, удалить');
    fireEvent.click(confirmBtn);

    await vi.waitFor(() => expect(removeMock).toHaveBeenCalledWith('s1'));
    await vi.waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/setlists'));
  });
});
