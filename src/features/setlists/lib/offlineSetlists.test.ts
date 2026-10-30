// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetDBConnection, getDB } from '@/shared/offline/db';
import { OfflineNoDataError, reportNetworkTimeout, resetNetworkSuspicionForTests } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, NetworkTimeoutError } from '@/shared/offline/networkTimeout';
import { getApiCache, persistApiCache } from '@/shared/offline/readThrough';
import type { Setlist, SetlistSummary } from '../types';
import { ApiClientError } from '@/shared/services/api/client';

const { getSetlistsMock, getSetlistMock } = vi.hoisted(() => ({
  getSetlistsMock: vi.fn(),
  getSetlistMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  setlistsApi: { getSetlists: getSetlistsMock, getSetlist: getSetlistMock },
}));

import {
  PULL_REFRESH_TIMEOUT_MS,
  readSetlistsThrough,
  readSetlistThrough,
  readSetlistThroughSWR,
  refreshSetlistsFromNetwork,
  SETLISTS_LIST_CACHE_KEY,
  setlistCacheKey,
} from './offlineSetlists';

const SUMMARY: SetlistSummary = { id: 'set-1', title: 'Воскресное', date: '2026-08-02', items: [{ songId: 1, title: 'Песня' }] };
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

  describe('refreshSetlistsFromNetwork', () => {
    it('успех -> список из сети, apiCache перезаписан в форме readThrough', async () => {
      await persistApiCache(SETLISTS_LIST_CACHE_KEY, { setlists: [] });
      getSetlistsMock.mockResolvedValueOnce({ setlists: [SUMMARY] });

      const result = await refreshSetlistsFromNetwork();
      expect(result).toEqual([SUMMARY]);
      // Ключ — импортированная константа, форма — полный ответ, как у readThrough.
      expect(await getApiCache(SETLISTS_LIST_CACHE_KEY)).toEqual({ setlists: [SUMMARY] });
    });

    it('navigator.onLine=false -> в сеть не ходим вовсе, промис реджектится', async () => {
      vi.stubGlobal('navigator', { onLine: false });
      getSetlistsMock.mockImplementationOnce(() => new Promise(() => {}));

      await expect(refreshSetlistsFromNetwork()).rejects.toThrow('Нет сети');
      expect(getSetlistsMock).not.toHaveBeenCalled();
    });

    it('обходит circuit breaker: разомкнутая цепь не превращает refresh в no-op', async () => {
      // Свежий таймаут размыкает цепь — readThrough в этом состоянии отдал бы кеш
      // мгновенно, а ручное обновление обязано реально сходить в сеть.
      reportNetworkTimeout();
      getSetlistsMock.mockResolvedValueOnce({ setlists: [SUMMARY] });

      const result = await refreshSetlistsFromNetwork();
      expect(getSetlistsMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual([SUMMARY]);
    });

    it('ошибка сети -> проброшена, старая запись в apiCache не затёрта', async () => {
      await persistApiCache(SETLISTS_LIST_CACHE_KEY, { setlists: [SUMMARY] });
      const err = new TypeError('Failed to fetch');
      getSetlistsMock.mockRejectedValueOnce(err);

      await expect(refreshSetlistsFromNetwork()).rejects.toBe(err);
      expect(await getApiCache(SETLISTS_LIST_CACHE_KEY)).toEqual({ setlists: [SUMMARY] });
    });

    it('зависшая сеть -> реджект по таймауту, тест не висит', async () => {
      getSetlistsMock.mockImplementationOnce(() => new Promise(() => {}));

      await expect(refreshSetlistsFromNetwork(20)).rejects.toBeInstanceOf(NetworkTimeoutError);
    });

    it('дефолтный таймаут длиннее сетевого дефолта — жест инициирован пользователем', () => {
      expect(PULL_REFRESH_TIMEOUT_MS).toBeGreaterThan(DEFAULT_NETWORK_TIMEOUT_MS);
    });
  });

  describe('readSetlistThroughSWR — фолбэк на кэш списка', () => {
    it('офлайн, детали нет, сет есть в кэше списка -> деталь собрана из списка', async () => {
      vi.stubGlobal('navigator', { onLine: false });
      await persistApiCache(SETLISTS_LIST_CACHE_KEY, { setlists: [SUMMARY] });
      getSetlistMock.mockImplementationOnce(() => new Promise(() => {}));

      const { setlist, fromCache } = await readSetlistThroughSWR('set-1', { timeoutMs: 20 });
      expect(fromCache).toBe(true);
      expect(setlist).toMatchObject({ id: 'set-1', title: 'Воскресное', date: '2026-08-02' });
      expect(setlist.items.map((item) => item.songId)).toEqual([1]);
    });

    it('сеть упала, деталь в IDB есть -> отдаётся деталь, а не сборка из списка', async () => {
      await persistApiCache(setlistCacheKey('set-1'), { setlist: DETAIL });
      await persistApiCache(SETLISTS_LIST_CACHE_KEY, { setlists: [SUMMARY] });
      const { setlist } = await readSetlistThroughSWR('set-1');
      expect(setlist.items[0].id).toBe('item-1');
    });

    it('сервер ответил 404 -> ошибка проброшена, кэш списка не подставляется', async () => {
      await persistApiCache(SETLISTS_LIST_CACHE_KEY, { setlists: [SUMMARY] });
      const err = new ApiClientError('Not found', 404);
      getSetlistMock.mockRejectedValueOnce(err);
      await expect(readSetlistThroughSWR('set-1')).rejects.toBe(err);
    });

    it('сета нет и в списке -> исходная ошибка', async () => {
      const err = new TypeError('Failed to fetch');
      getSetlistMock.mockRejectedValueOnce(err);
      await expect(readSetlistThroughSWR('set-1')).rejects.toBe(err);
    });
  });
});
