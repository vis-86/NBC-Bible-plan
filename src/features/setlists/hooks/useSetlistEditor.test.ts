// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetlistItem } from '../types';

const { removeMock, updateMock, dbDeleteMock, resetCacheMock } = vi.hoisted(() => ({
  removeMock: vi.fn(),
  updateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  resetCacheMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  setlistsApi: { remove: removeMock, update: updateMock },
}));
vi.mock('@/shared/offline/db', () => ({
  getDB: async () => ({ delete: dbDeleteMock }),
}));
vi.mock('./useSetlists', () => ({ resetSetlistsCache: resetCacheMock }));

import { ApiClientError } from '@/shared/services/api/client';
import { setlistCacheKey, SETLISTS_LIST_CACHE_KEY } from '../lib/offlineSetlists';
import { useSetlistEditor } from './useSetlistEditor';

const SET_ID = 'set-1';
const ITEMS: SetlistItem[] = [
  { id: 'i1', sort: 0, songId: 1, title: 'Песня 1' },
  { id: 'i2', sort: 1, songId: 2, title: 'Песня 2' },
];

function renderEditor() {
  const onDeleted = vi.fn();
  const onItemsChange = vi.fn();
  const view = renderHook(() =>
    useSetlistEditor({ setlistId: SET_ID, items: ITEMS, onItemsChange, songs: [], onDeleted })
  );
  return { ...view, onDeleted, onItemsChange };
}

beforeEach(() => {
  removeMock.mockReset();
  updateMock.mockReset();
  dbDeleteMock.mockReset();
  dbDeleteMock.mockResolvedValue(undefined);
  resetCacheMock.mockReset();
});

describe('useSetlistEditor.removeSetlist', () => {
  it('404 (сета уже нет) — это успех: кэш сброшен, onDeleted вызван, ошибки нет', async () => {
    removeMock.mockRejectedValueOnce(new ApiClientError('Not found', 404));
    const { result, onDeleted } = renderEditor();

    await act(async () => {
      await result.current.removeSetlist();
    });

    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(resetCacheMock).toHaveBeenCalledTimes(1);
    expect(dbDeleteMock).toHaveBeenCalledWith('apiCache', setlistCacheKey(SET_ID));
    expect(dbDeleteMock).toHaveBeenCalledWith('apiCache', SETLISTS_LIST_CACHE_KEY);
    expect(result.current.error).toBeNull();
  });

  it('200 — тот же путь: кэш сброшен, onDeleted вызван', async () => {
    removeMock.mockResolvedValueOnce(undefined);
    const { result, onDeleted } = renderEditor();

    await act(async () => {
      await result.current.removeSetlist();
    });

    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(resetCacheMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('500 — ошибка в модалке, экран остаётся, кэш не трогается', async () => {
    removeMock.mockRejectedValueOnce(new ApiClientError('Internal server error', 500));
    const { result, onDeleted } = renderEditor();

    await act(async () => {
      await result.current.removeSetlist();
    });

    expect(onDeleted).not.toHaveBeenCalled();
    expect(resetCacheMock).not.toHaveBeenCalled();
    expect(dbDeleteMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Internal server error');
    expect(result.current.deleting).toBe(false);
  });
});

describe('useSetlistEditor: правка состава на 404', () => {
  it('PATCH 404 — откат к прежнему составу и ошибка', async () => {
    updateMock.mockRejectedValueOnce(new ApiClientError('Not found', 404));
    const { result, onItemsChange } = renderEditor();

    await act(async () => {
      result.current.remove(2);
    });

    // remove() запускает PATCH без await — ждём отката.
    await waitFor(() => expect(onItemsChange).toHaveBeenLastCalledWith(ITEMS));
    expect(onItemsChange).toHaveBeenNthCalledWith(1, [ITEMS[0]]);
    expect(result.current.error).toBe('Not found');
  });
});
