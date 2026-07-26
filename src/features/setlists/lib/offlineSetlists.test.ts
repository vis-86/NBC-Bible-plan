// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetDBConnection, getDB } from '@/shared/offline/db';
import { OfflineNoDataError, resetNetworkSuspicionForTests } from '@/shared/offline/networkHealth';
import { getApiCache, persistApiCache } from '@/shared/offline/readThrough';
import type { Setlist, SetlistSummary } from '../types';

const { getSetlistsMock, getSetlistMock } = vi.hoisted(() => ({
  getSetlistsMock: vi.fn(),
  getSetlistMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  setlistsApi: { getSetlists: getSetlistsMock, getSetlist: getSetlistMock },
}));

import { readSetlistsThrough, readSetlistThrough, SETLISTS_LIST_CACHE_KEY, setlistCacheKey } from './offlineSetlists';

const SUMMARY: SetlistSummary = { id: 'set-1', title: 'Воскресное', date: '2026-08-02', itemCount: 2 };
const DETAIL: Setlist = {
  id: 'set-1',
  title: 'Воскресное',
  date: '2026-08-02',
  items: [{ id: 'item-1', sort: 0, songId: 1, title: 'Песня' }],
};

describe('offlineSetlists', () => {
  beforeEach(async () => {
    __resetDBConnection();
    resetNetworkSuspicionForTests();
    getSetlistsMock.mockReset();
    getSetlistMock.mockReset();
    // Точечная очистка apiCache вместо удаления всей БД — полное удаление зависает
    // в fake-indexeddb при повторных открытиях соединения между тестами.
    const db = await getDB();
    await db.clear('apiCache');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('readSetlistsThrough: сеть ок -> список из ответа, закеширован', async () => {
    getSetlistsMock.mockResolvedValueOnce({ setlists: [SUMMARY] });
    const result = await readSetlistsThrough();
    expect(result).toEqual([SUMMARY]);

    await new Promise((r) => setTimeout(r, 0));
    expect(await getApiCache(SETLISTS_LIST_CACHE_KEY)).toEqual({ setlists: [SUMMARY] });
  });

  it('readSetlistsThrough: fetcher мгновенно reject + кеш есть -> отдаёт кеш', async () => {
    await persistApiCache(SETLISTS_LIST_CACHE_KEY, { setlists: [SUMMARY] });
    getSetlistsMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await readSetlistsThrough();
    expect(result).toEqual([SUMMARY]);
  });

  it('readSetlistsThrough: ЗАВИСШАЯ сеть (таймаут) + кеш есть -> отдаёт кеш', async () => {
    await persistApiCache(SETLISTS_LIST_CACHE_KEY, { setlists: [SUMMARY] });
    getSetlistsMock.mockImplementationOnce(() => new Promise(() => {}));

    const result = await readSetlistsThrough(20);
    expect(result).toEqual([SUMMARY]);
  });

  it('readSetlistsThrough: кеш пуст + navigator.onLine=false -> быстрый OfflineNoDataError', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    getSetlistsMock.mockImplementationOnce(() => new Promise(() => {}));

    await expect(readSetlistsThrough(20)).rejects.toBeInstanceOf(OfflineNoDataError);
  });

  it('readSetlistThrough: сеть ок -> деталь из ответа', async () => {
    getSetlistMock.mockResolvedValueOnce({ setlist: DETAIL });
    const result = await readSetlistThrough('set-1');
    expect(result).toEqual(DETAIL);
  });

  it('readSetlistThrough: fetcher reject + кеш есть -> деталь из кеша', async () => {
    await persistApiCache(setlistCacheKey('set-1'), { setlist: DETAIL });
    getSetlistMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await readSetlistThrough('set-1');
    expect(result).toEqual(DETAIL);
  });

  it('readSetlistThrough: ЗАВИСШАЯ сеть + кеша нет -> дожидается медленную сеть', async () => {
    getSetlistMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ setlist: DETAIL }), 60))
    );

    const result = await readSetlistThrough('set-1', 20);
    expect(result).toEqual(DETAIL);
  });

  it('readSetlistThrough: пробрасывает исходную ошибку, если кеша нет', async () => {
    const err = new TypeError('Failed to fetch');
    getSetlistMock.mockRejectedValueOnce(err);
    await expect(readSetlistThrough('set-2')).rejects.toBe(err);
  });
});
