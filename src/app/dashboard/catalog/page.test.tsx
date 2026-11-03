// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const catalog = vi.hoisted(() => ({ state: { status: 'loading' } as unknown, retry: vi.fn() }));
vi.mock('@/features/songs/hooks/useCatalog', () => ({
  useCatalog: () => ({ state: catalog.state, retry: catalog.retry }),
}));

import CatalogPage from './page';

const songs = [
  { id: '1', title: 'Первая', teamName: 'Команда А' },
  { id: '2', title: 'Вторая', teamName: 'Команда Б', copiedAs: '77' },
];

describe('CatalogPage', () => {
  it('«Уже у вас» у скопированной, тап ведёт на нашу копию', () => {
    catalog.state = { status: 'ready', songs };
    render(<CatalogPage />);
    expect(screen.getAllByText('Уже у вас')).toHaveLength(1);
    fireEvent.click(document.querySelector('[data-song-catalog-item="2"]')!);
    expect(push).toHaveBeenCalledWith('/dashboard/song?id=77');
    fireEvent.click(document.querySelector('[data-song-catalog-item="1"]')!);
    expect(push).toHaveBeenCalledWith('/dashboard/catalog?id=1');
  });

  it('офлайн — «доступен только с интернетом» и повтор', () => {
    catalog.state = { status: 'offline' };
    render(<CatalogPage />);
    expect(screen.getByText(/доступен только с интернетом/)).toBeTruthy();
    fireEvent.click(screen.getByText('Повторить'));
    expect(catalog.retry).toHaveBeenCalled();
  });
});
