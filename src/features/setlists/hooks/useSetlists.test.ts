// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetlistSummary } from '../types';

const { readThroughMock, refreshMock } = vi.hoisted(() => ({
  readThroughMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('../lib/offlineSetlists', () => ({
  readSetlistsThrough: readThroughMock,
  refreshSetlistsFromNetwork: refreshMock,
}));

import { resetSetlistsCache, useSetlists } from './useSetlists';

const OLD: SetlistSummary = { id: 's1', title: 'Старый', date: null, items: [] };
const FRESH: SetlistSummary = { id: 's2', title: 'Свежий', date: null, items: [] };

/** Смонтировать хук и дождаться конца первичной загрузки. */
async function renderLoaded() {
  const view = renderHook(() => useSetlists());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useSetlists.refresh', () => {
  beforeEach(() => {
    resetSetlistsCache();
    readThroughMock.mockReset();
    refreshMock.mockReset();
    readThroughMock.mockResolvedValue([OLD]);
  });

  it('успешный refresh заменяет список и обновляет module-кэш', async () => {
    refreshMock.mockResolvedValueOnce([FRESH]);
    const { result, unmount } = await renderLoaded();
    expect(result.current.setlists).toEqual([OLD]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.setlists).toEqual([FRESH]);
    expect(result.current.refreshError).toBeNull();
    unmount();

    // Второй монтаж стартует уже со свежими данными и в сеть не идёт.
    readThroughMock.mockClear();
    const second = renderHook(() => useSetlists());
    expect(second.result.current.setlists).toEqual([FRESH]);
    expect(second.result.current.loading).toBe(false);
    expect(readThroughMock).not.toHaveBeenCalled();
  });

  it('ошибка refresh -> refreshError заполнен, список прежний', async () => {
    refreshMock.mockRejectedValueOnce(new Error('Нет сети. Список не обновлён'));
    const { result } = await renderLoaded();

    await act(async () => {
      // Промис резолвится в обоих исходах — жест не должен ловить исключение.
      await expect(result.current.refresh()).resolves.toBeUndefined();
    });

    expect(result.current.refreshError).toBe('Нет сети. Список не обновлён');
    expect(result.current.setlists).toEqual([OLD]);
    expect(result.current.refreshing).toBe(false);
  });

  it('повторный вызов во время refreshing -> второго обращения к сети нет', async () => {
    let release: (v: SetlistSummary[]) => void = () => {};
    refreshMock.mockImplementationOnce(() => new Promise<SetlistSummary[]>((r) => (release = r)));
    const { result } = await renderLoaded();

    let first: Promise<void>;
    act(() => {
      first = result.current.refresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(true));

    await act(async () => {
      await result.current.refresh();
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release([FRESH]);
      await first;
    });
    expect(result.current.setlists).toEqual([FRESH]);
  });

  it('refresh во время первичной загрузки -> в сеть не идёт', async () => {
    readThroughMock.mockImplementationOnce(
      () => new Promise<SetlistSummary[]>((r) => setTimeout(() => r([OLD]), 20))
    );
    const { result } = renderHook(() => useSetlists());
    expect(result.current.loading).toBe(true);

    await act(async () => {
      await result.current.refresh();
    });
    expect(refreshMock).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
