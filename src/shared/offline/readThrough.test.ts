// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readThrough, readThroughSWR, getApiCache, persistApiCache } from './readThrough';
import { __resetDBConnection, getDB } from './db';
import * as dbModule from './db';
import { OfflineNoDataError, resetNetworkSuspicionForTests } from './networkHealth';

describe('readThrough', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    __resetDBConnection();
    // Таймаут в одном тесте размыкает circuit breaker на 20s — без сброса
    // следующие тесты файла получали бы мгновенный фолбэк вместо похода в сеть.
    resetNetworkSuspicionForTests();
  });

  it('при успешном fetcher кеширует и возвращает сетевой результат', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
    const result = await readThrough('key:a', fetcher);
    expect(result).toEqual({ items: [1, 2, 3] });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // ждём фоновую запись в IDB
    await new Promise((r) => setTimeout(r, 0));
    expect(await getApiCache('key:a')).toEqual({ items: [1, 2, 3] });
  });

  it('при сетевой ошибке отдаёт последний закешированный результат', async () => {
    await persistApiCache('key:b', { items: ['stale'] });
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await readThrough('key:b', fetcher);
    expect(result).toEqual({ items: ['stale'] });
  });

  it('пробрасывает исходную ошибку, если кеш пуст', async () => {
    const err = new TypeError('Failed to fetch');
    const fetcher = vi.fn().mockRejectedValue(err);

    await expect(readThrough('key:c', fetcher)).rejects.toBe(err);
  });

  it('ЗАВИСШАЯ сеть (реальный «офлайн» без reject) -> по таймауту отдаёт кеш', async () => {
    // Регрессионный тест: в мёртвой соте/Wi-Fi без аплинка fetch висит минутами —
    // без таймаута IDB-фолбэк не наступал и экран застревал на вечной загрузке.
    await persistApiCache('key:d', { items: ['from-idb'] });
    const fetcher = vi.fn(() => new Promise<unknown>(() => {})); // висит вечно

    const result = await readThrough('key:d', fetcher, 20);
    expect(result).toEqual({ items: ['from-idb'] });
  });

  it('ЗАВИСШАЯ сеть + кеш пуст -> дожидается медленную сеть, а не падает', async () => {
    const fetcher = vi.fn(
      () => new Promise<unknown>((resolve) => setTimeout(() => resolve({ items: ['slow'] }), 60))
    );

    const result = await readThrough('key:e', fetcher, 20);
    expect(result).toEqual({ items: ['slow'] });
  });

  it('ЗАВЕДОМЫЙ офлайн + кеш пуст -> падает OfflineNoDataError, а не висит вечно', async () => {
    // Регрессия: ждать медленную сеть осмысленно, ждать отсутствующую — вечный
    // спиннер без единой ошибки в консоли (список песен офлайн).
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn(() => new Promise<unknown>(() => {})); // не резолвится никогда

    await expect(readThrough('key:f', fetcher, 20)).rejects.toBeInstanceOf(OfflineNoDataError);
  });

  it('ЗАВЕДОМЫЙ офлайн, но кеш есть -> отдаёт кеш, ошибку не бросает', async () => {
    await persistApiCache('key:g', { items: ['from-idb'] });
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn(() => new Promise<unknown>(() => {}));

    await expect(readThrough('key:g', fetcher, 20)).resolves.toEqual({ items: ['from-idb'] });
  });
});

describe('readThroughSWR', () => {
  const STALE_AGE_MS = 10 * 60_000;

  beforeEach(() => {
    __resetDBConnection();
    resetNetworkSuspicionForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Кладёт запись в apiCache с заданным возрастом (persistApiCache всегда пишет «сейчас»). */
  async function seed(key: string, data: unknown, ageMs: number) {
    const db = await getDB();
    await db.put('apiCache', { key, data, updatedAt: Date.now() - ageMs });
  }

  it('свежий кеш отдаётся мгновенно, fetcher НЕ вызывается', async () => {
    await seed('swr:fresh', { items: [1] }, 1_000);
    const fetcher = vi.fn().mockResolvedValue({ items: [2] });

    const res = await readThroughSWR('swr:fresh', fetcher);

    expect(res).toEqual({ data: { items: [1] }, fromCache: true, revalidating: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('протухший кеш: данные мгновенно, onFresh после фоновой сети', async () => {
    await seed('swr:stale', { items: ['old'] }, STALE_AGE_MS);
    const fetcher = vi.fn().mockResolvedValue({ items: ['new'] });
    const onFresh = vi.fn();

    const res = await readThroughSWR('swr:stale', fetcher, { onFresh });

    expect(res.data).toEqual({ items: ['old'] });
    expect(res.revalidating).toBe(true);

    await vi.waitFor(() => expect(onFresh).toHaveBeenCalledWith({ items: ['new'] }));
    expect(await getApiCache('swr:stale')).toEqual({ items: ['new'] });
  });

  it('пустой кеш: прежнее поведение network-first', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: ['net'] });

    const res = await readThroughSWR('swr:empty', fetcher);

    expect(res).toEqual({ data: { items: ['net'] }, fromCache: false, revalidating: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('кеш `[]` не принимается за промах кеша', async () => {
    await seed('swr:empty-array', [], 1_000);
    const fetcher = vi.fn().mockResolvedValue([{ id: 1 }]);

    const res = await readThroughSWR('swr:empty-array', fetcher);

    expect(res).toEqual({ data: [], fromCache: true, revalidating: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('офлайн-режим A: fetcher мгновенно reject + кеш есть -> кеш, путь не падает', async () => {
    await seed('swr:reject', { items: ['cached'] }, STALE_AGE_MS);
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const onFresh = vi.fn();

    const res = await readThroughSWR('swr:reject', fetcher, { onFresh });

    expect(res.data).toEqual({ items: ['cached'] });
    await new Promise((r) => setTimeout(r, 0));
    expect(onFresh).not.toHaveBeenCalled();
  });

  it('офлайн-режим B: fetcher НИКОГДА не резолвится + кеш есть -> кеш отдан сразу', async () => {
    await seed('swr:hang', { items: ['cached'] }, STALE_AGE_MS);
    const fetcher = vi.fn(() => new Promise<unknown>(() => {})); // висит вечно

    const res = await readThroughSWR('swr:hang', fetcher);

    expect(res.data).toEqual({ items: ['cached'] });
    expect(res.revalidating).toBe(true);
  });

  it('navigator.onLine === false + пустой кеш -> OfflineNoDataError', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn(() => new Promise<unknown>(() => {}));

    await expect(readThroughSWR('swr:offline-empty', fetcher, { timeoutMs: 10 })).rejects.toBeInstanceOf(
      OfflineNoDataError
    );
  });

  it('navigator.onLine === false + протухший кеш -> сеть не трогаем вовсе', async () => {
    await seed('swr:offline-stale', { items: ['cached'] }, STALE_AGE_MS);
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn();

    const res = await readThroughSWR('swr:offline-stale', fetcher);

    expect(res).toEqual({ data: { items: ['cached'] }, fromCache: true, revalidating: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ошибка IDB не роняет путь — уходим в network-first', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: ['net'] });
    const spy = vi.spyOn(dbModule, 'getDB').mockRejectedValue(new Error('IDB dead'));

    const res = await readThroughSWR('swr:idb-fail', fetcher);

    expect(res.data).toEqual({ items: ['net'] });
    spy.mockRestore();
  });
});
