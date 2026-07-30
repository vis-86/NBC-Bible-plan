// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ id: '2', setlistId: 's1' }),
}));

vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/features/songs/hooks/useSong', () => ({
  useSong: () => ({ song: { id: '2', title: 'Вторая', content: 'text', key: 'G' }, loading: false, error: null }),
}));

vi.mock('@/features/songs/hooks/useSongViewSettings', () => ({
  useSongViewSettings: () => [
    { fontSize: 16, showChords: true, density: 'normal', showHeader: true, columns: 1 },
    vi.fn(),
  ],
  resolveSongViewMode: (columns: 1 | 2, isWideLayout: boolean) => (columns === 2 && isWideLayout ? 'sheets' : 'scroll'),
  SONG_WIDE_LAYOUT_QUERY: '(min-width: 640px)',
}));

vi.mock('@/features/songs/hooks/useSongKey', () => ({
  useSongKey: () => ({
    effectiveKey: 'G',
    source: 'original',
    options: ['G', 'A'],
    setKey: vi.fn(),
    resetKey: vi.fn(),
    capo: 0,
    setCapo: vi.fn(),
    shapeKey: 'G',
    renderSemitones: 0,
  }),
}));

const pauseMock = vi.fn();
let autoscrollPlaying = false;
vi.mock('@/features/songs/hooks/useAutoScroll', () => ({
  useAutoScroll: () => ({
    playing: autoscrollPlaying,
    canScroll: true,
    step: 1,
    setStep: vi.fn(),
    toggle: vi.fn(),
    play: vi.fn(),
    pause: pauseMock,
  }),
}));

vi.mock('@/shared/hooks/useAutoHideOnScroll', () => ({
  useAutoHideOnScroll: () => ({ hidden: false, ignoreNextScroll: vi.fn(), setHidden: vi.fn() }),
}));

let wideLayout = false;
vi.mock('@/shared/hooks/useMediaQuery', () => ({
  useMediaQuery: () => wideLayout,
}));

vi.mock('@/shared/hooks/useAppRole', () => ({
  useAppRole: () => ({ canManageSetlists: true, role: 'musician', loading: false }),
}));

vi.mock('@/features/songs/hooks/useSongs', () => ({
  useSongs: () => ({ songs: [], loading: false, error: null }),
}));

const goToMock = vi.fn();
const applyItemsMock = vi.fn();
let playbackState = {
  title: 'Воскресное',
  applyItems: applyItemsMock,
  items: [
    { id: 'i1', sort: 0, songId: 1, title: 'Первая' },
    { id: 'i2', sort: 1, songId: 2, title: 'Вторая' },
    { id: 'i3', sort: 2, songId: 3, title: 'Третья' },
  ],
  index: 1,
  total: 3,
  prevId: 1 as number | null,
  nextId: 3 as number | null,
  goTo: goToMock,
  inSetlist: true,
};
vi.mock('@/features/setlists/hooks/useSetlistPlayback', () => ({
  useSetlistPlayback: () => playbackState,
}));

vi.mock('@/features/songs/components/SongView', () => ({ SongView: () => <div data-song-view /> }));
vi.mock('@/features/songs/components/SongKeyPicker', () => ({ SongKeyPicker: () => <div /> }));
vi.mock('@/features/songs/components/SongViewSettings', () => ({ SongViewSettings: () => null }));
vi.mock('@/features/songs/components/SongAutoScroll', () => ({
  SongAutoScroll: () => <div data-song-autoscroll-fab />,
}));

import SongPage from './page';

function fireSwipe(el: Element, startX: number, endX: number, y = 100) {
  fireEvent.pointerDown(el, { clientX: startX, clientY: y });
  fireEvent.pointerMove(el, { clientX: endX, clientY: y });
  fireEvent.pointerUp(el, { clientX: endX, clientY: y });
}

describe('SongPage — режим сета (T18/T19)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    wideLayout = false;
    autoscrollPlaying = false;
    playbackState = { ...playbackState, prevId: 1, nextId: 3, inSetlist: true, index: 1 };
  });

  it('кнопки ‹ › disabled на границах сета', () => {
    playbackState.prevId = null;
    const { container } = render(<SongPage />);
    const prevBtn = container.querySelector('[data-setlist-pager-dock-prev]') as HTMLButtonElement;
    const nextBtn = container.querySelector('[data-setlist-pager-dock-next]') as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);
  });

  it('счётчик показывает «2 / 3»', () => {
    render(<SongPage />);
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });

  it('переход к следующей песне вызывает goTo (router.replace) и ставит автоскролл на паузу', () => {
    const { container } = render(<SongPage />);
    fireEvent.click(container.querySelector('[data-setlist-pager-dock-next]') as HTMLElement);
    expect(goToMock).toHaveBeenCalledWith(3);
    expect(pauseMock).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('свайп влево в mode="scroll" переходит к следующей песне', () => {
    const { container } = render(<SongPage />);
    const swipePager = container.querySelector('[data-swipe-pager]') as HTMLElement;
    fireSwipe(swipePager, 200, 80);
    expect(goToMock).toHaveBeenCalledWith(3);
  });

  it('свайп влево на последней песне сета (canNext=false, onEnd не задан) -> router.replace не вызван', () => {
    playbackState.nextId = null;
    const { container } = render(<SongPage />);
    const swipePager = container.querySelector('[data-swipe-pager]') as HTMLElement;
    fireSwipe(swipePager, 200, 80);
    expect(goToMock).not.toHaveBeenCalled();
  });

  it('тап по строке в шторке сета переходит к песне и закрывает шторку', () => {
    const { container, getByText } = render(<SongPage />);
    fireEvent.click(container.querySelector('[data-setlist-pager-dock-counter]') as HTMLElement);
    const row = getByText('Первая').closest('[data-setlist-view-item]') as HTMLElement;
    fireEvent.click(row);
    expect(goToMock).toHaveBeenCalledWith(1);
    expect(container.querySelector('[data-setlist-manage-sheet]')).toBeNull();
  });

  it('шторка сета — точка правки: в ней есть добавление и удаление сета', () => {
    const { container } = render(<SongPage />);
    fireEvent.click(container.querySelector('[data-setlist-pager-dock-counter]') as HTMLElement);
    expect(container.querySelector('[data-setlist-manage-sheet-add]')).toBeTruthy();
    expect(container.querySelector('[data-setlist-manage-sheet-delete]')).toBeTruthy();
  });

  it('текущая песня в шторке помечена aria-current', () => {
    const { container } = render(<SongPage />);
    fireEvent.click(container.querySelector('[data-setlist-pager-dock-counter]') as HTMLElement);
    const current = container.querySelector('[aria-current="true"]');
    expect(current?.textContent).toContain('Вторая');
  });

  it('при открытой шторке сета FAB автоскролла скрыт', () => {
    const { container, queryByText } = render(<SongPage />);
    expect(container.querySelector('[data-song-autoscroll-fab]')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-setlist-pager-dock-counter]') as HTMLElement);
    expect(container.querySelector('[data-song-autoscroll-fab]')).toBeNull();
    void queryByText;
  });
});

describe('SongPage — фокус-режим автоскролла', () => {
  afterEach(() => {
    vi.clearAllMocks();
    wideLayout = false;
    autoscrollPlaying = false;
    playbackState = { ...playbackState, prevId: 1, nextId: 3, inSetlist: true, index: 1 };
  });

  it('автоскролл на паузе: шапка развёрнута, карандаш в стеке', () => {
    const { container } = render(<SongPage />);
    expect(container.querySelector('[data-song-page-header-collapse]')?.className).toContain('grid-rows-[1fr]');
    expect(container.querySelector('[data-song-ink-open]')).toBeTruthy();
  });

  it('играющий автоскролл сворачивает шапку и прячет карандаш, FAB остаётся', () => {
    autoscrollPlaying = true;
    const { container } = render(<SongPage />);
    expect(container.querySelector('[data-song-page-header-collapse]')?.className).toContain('grid-rows-[0fr]');
    expect(container.querySelector('[data-song-ink-open]')).toBeNull();
    // Выход из режима возможен только через FAB — он не прячется никогда.
    expect(container.querySelector('[data-song-autoscroll-fab]')).toBeTruthy();
  });

  it('играющий автоскролл уводит таблетку сета', () => {
    autoscrollPlaying = true;
    const { container } = render(<SongPage />);
    const dock = container.querySelector('[data-setlist-pager-dock]') as HTMLElement;
    expect(dock.className).toContain('translate-y-24');
    expect(dock.className).toContain('opacity-0');
  });
});
