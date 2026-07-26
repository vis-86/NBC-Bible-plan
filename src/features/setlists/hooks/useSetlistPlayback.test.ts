// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), prefetch: vi.fn() }),
}));

const { getSetlistMock, getSongMock } = vi.hoisted(() => ({
  getSetlistMock: vi.fn(),
  getSongMock: vi.fn(),
}));
vi.mock('@/shared/services/api/endpoints', () => ({
  setlistsApi: { getSetlist: getSetlistMock },
  songsApi: { getSong: getSongMock },
}));

import { useSetlistPlayback } from './useSetlistPlayback';

const SETLIST = {
  setlist: {
    id: 's1',
    title: 'Сет',
    date: null,
    items: [
      { id: 'i1', sort: 0, songId: 1, title: 'Первая' },
      { id: 'i2', sort: 1, songId: 2, title: 'Вторая' },
      { id: 'i3', sort: 2, songId: 3, title: 'Третья' },
    ],
  },
};

describe('useSetlistPlayback', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('пустой setlistId -> inSetlist=false, переходы no-op', async () => {
    const { result } = renderHook(() => useSetlistPlayback('', 1));
    expect(result.current.inSetlist).toBe(false);
    expect(result.current.total).toBe(0);
    result.current.goTo(2);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(getSetlistMock).not.toHaveBeenCalled();
  });

  it('индекс/prev/next в середине сета', async () => {
    getSetlistMock.mockResolvedValue(SETLIST);
    getSongMock.mockResolvedValue({ song: { id: '2', title: 'x' } });
    const { result } = renderHook(() => useSetlistPlayback('s1', 2));
    await waitFor(() => expect(result.current.inSetlist).toBe(true));
    expect(result.current.index).toBe(1);
    expect(result.current.total).toBe(3);
    expect(result.current.prevId).toBe(1);
    expect(result.current.nextId).toBe(3);
  });

  it('первая позиция: prevId=null', async () => {
    getSetlistMock.mockResolvedValue(SETLIST);
    getSongMock.mockResolvedValue({ song: { id: '1', title: 'x' } });
    const { result } = renderHook(() => useSetlistPlayback('s1', 1));
    await waitFor(() => expect(result.current.inSetlist).toBe(true));
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBe(2);
  });

  it('последняя позиция: nextId=null', async () => {
    getSetlistMock.mockResolvedValue(SETLIST);
    getSongMock.mockResolvedValue({ song: { id: '3', title: 'x' } });
    const { result } = renderHook(() => useSetlistPlayback('s1', 3));
    await waitFor(() => expect(result.current.inSetlist).toBe(true));
    expect(result.current.nextId).toBeNull();
    expect(result.current.prevId).toBe(2);
  });

  it('сет из одной песни: prev и next оба null', async () => {
    getSetlistMock.mockResolvedValue({
      setlist: { id: 's2', title: 'Сет', date: null, items: [{ id: 'i1', sort: 0, songId: 5, title: 'Одна' }] },
    });
    const { result } = renderHook(() => useSetlistPlayback('s2', 5));
    await waitFor(() => expect(result.current.inSetlist).toBe(true));
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
    expect(result.current.total).toBe(1);
  });

  it('песня не входит в сет -> inSetlist=false, не бросает', async () => {
    getSetlistMock.mockResolvedValue(SETLIST);
    const { result } = renderHook(() => useSetlistPlayback('s1', 999));
    await waitFor(() => expect(getSetlistMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.index).toBe(-1));
    expect(result.current.inSetlist).toBe(false);
  });

  it('goTo вызывает router.replace с setlistId', async () => {
    getSetlistMock.mockResolvedValue(SETLIST);
    getSongMock.mockResolvedValue({ song: { id: '2', title: 'x' } });
    const { result } = renderHook(() => useSetlistPlayback('s1', 2));
    await waitFor(() => expect(result.current.inSetlist).toBe(true));
    result.current.goTo(3);
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/song?id=3&setlistId=s1');
  });

  it('офлайн: fetcher реджектится, сет уже в IDB apiCache -> навигация всё равно работает', async () => {
    // readSetlistThrough использует общий readThrough(apiCache); эмулируем офлайн через
    // прямую подмену setlistsApi.getSetlist на reject и предварительно прогретый кеш.
    const { persistApiCache } = await import('@/shared/offline/readThrough');
    await persistApiCache('setlists:item:s1', SETLIST);
    getSetlistMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useSetlistPlayback('s1', 2));
    await waitFor(() => expect(result.current.inSetlist).toBe(true));
    expect(result.current.prevId).toBe(1);
    expect(result.current.nextId).toBe(3);
  });
});
