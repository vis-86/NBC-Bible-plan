// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSongThrough, readSongThroughSWR, getCachedSong, persistCachedSong } from './offlineSongs';
import { __resetDBConnection, getDB } from '@/shared/offline/db';
import * as dbModule from '@/shared/offline/db';
import { OfflineNoDataError, resetNetworkSuspicionForTests } from '@/shared/offline/networkHealth';
import type { Song } from '../types';

const SONG: Song = {
  id: '42',
  title: 'Великий Бог',
  subtitle: 'How Great Thou Art',
  key: 'G',
  content: '{soc}\n[G]О Бог[C]великий[D]\n{eoc}',
};

describe('offlineSongs', () => {
  beforeEach(() => {
    __resetDBConnection();
    // Таймаут в одном тесте размыкает circuit breaker на 20s — сбрасываем изоляции ради.
    resetNetworkSuspicionForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('при успешном fetcher кеширует и возвращает песню из сети', async () => {
    const fetcher = vi.fn().mockResolvedValue(SONG);
    const result = await readSongThrough('42', fetcher);
    expect(result).toEqual(SONG);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // ждём фоновую запись в IDB
    await new Promise((r) => setTimeout(r, 0));
    expect(await getCachedSong('42')).toEqual(SONG);
  });

  it('офлайн: при сетевой ошибке отдаёт скачанную песню из store `songs`', async () => {
    // имитируем результат downloadSongs — песня уже лежит в IDB
    await persistCachedSong(SONG);
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await readSongThrough('42', fetcher);
    expect(result).toEqual(SONG);
  });

  it('находит песню по числовому id (ключ хранится строкой)', async () => {
    await persistCachedSong(SONG);
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await readSongThrough(42, fetcher);
    expect(result).toEqual(SONG);
  });

  it('пробрасывает исходную ошибку, если песни нет в кеше', async () => {
    const err = new TypeError('Failed to fetch');
    const fetcher = vi.fn().mockRejectedValue(err);

    await expect(readSongThrough('999', fetcher)).rejects.toBe(err);
  });

  it('ЗАВИСШАЯ сеть (реальный «офлайн» без reject) -> по таймауту отдаёт песню из IDB', async () => {
    await persistCachedSong(SONG);
    const fetcher = vi.fn(() => new Promise<Song>(() => {})); // висит вечно

    const result = await readSongThrough('42', fetcher, 20);
    expect(result).toEqual(SONG);
  });

  it('ЗАВИСШАЯ сеть + кеша нет -> дожидается медленную сеть', async () => {
    const fetcher = vi.fn(
      () => new Promise<Song>((resolve) => setTimeout(() => resolve(SONG), 60))
    );

    const result = await readSongThrough('42', fetcher, 20);
    expect(result).toEqual(SONG);
  });

  it('запись СТАРОЙ формы (без defaultKey) читается без ошибки', async () => {
    // Песни, скачанные до появления `default_key`, лежат в IDB без этого поля.
    // Поле аддитивное, DB_VERSION не поднимался — читатель обязан отработать undefined
    // (резолвер тогда откатывается на исходную тональность, см. songKey.test.ts).
    const legacy = { id: '77', title: 'Старая запись', key: 'G', content: '[G]текст' } as Song;
    await persistCachedSong(legacy);
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await readSongThrough('77', fetcher);
    expect(result).toEqual(legacy);
    expect(result.defaultKey).toBeUndefined();
  });

  it('ЗАВЕДОМЫЙ офлайн + песни нет в IDB -> падает OfflineNoDataError, а не висит', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn(() => new Promise<Song>(() => {}));

    await expect(readSongThrough('999', fetcher, 20)).rejects.toBeInstanceOf(OfflineNoDataError);
  });
});

describe('readSongThroughSWR', () => {
  const STALE_AGE_MS = 10 * 60_000;

  beforeEach(() => {
    __resetDBConnection();
    resetNetworkSuspicionForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Кладёт песню в стор `songs` с заданным возрастом записи. */
  async function seed(song: Song, ageMs: number) {
    const db = await getDB();
    await db.put('songs', { id: String(song.id), data: song, updatedAt: Date.now() - ageMs });
  }

  it('свежий кеш отдаётся мгновенно, fetcher НЕ вызывается', async () => {
    await seed(SONG, 1_000);
    const fetcher = vi.fn();

    const res = await readSongThroughSWR('42', fetcher);

    expect(res).toEqual({ song: SONG, fromCache: true, revalidating: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('протухший кеш: песня мгновенно, onFresh после фоновой сети', async () => {
    await seed(SONG, STALE_AGE_MS);
    const fresh: Song = { ...SONG, content: '{soc}\n[A]Обновлённый текст\n{eoc}' };
    const fetcher = vi.fn().mockResolvedValue(fresh);
    const onFresh = vi.fn();

    const res = await readSongThroughSWR('42', fetcher, { onFresh });

    expect(res.song).toEqual(SONG);
    expect(res.revalidating).toBe(true);

    await vi.waitFor(() => expect(onFresh).toHaveBeenCalledWith(fresh));
    expect(await getCachedSong('42')).toEqual(fresh);
  });

  it('пустой кеш: прежнее поведение network-first', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ...SONG, id: 'swr-miss' });

    const res = await readSongThroughSWR('swr-miss', fetcher);

    expect(res).toEqual({ song: { ...SONG, id: 'swr-miss' }, fromCache: false, revalidating: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('офлайн-режим A: fetcher мгновенно reject + песня в IDB -> кеш', async () => {
    await seed(SONG, STALE_AGE_MS);
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const onFresh = vi.fn();

    const res = await readSongThroughSWR('42', fetcher, { onFresh });

    expect(res.song).toEqual(SONG);
    await new Promise((r) => setTimeout(r, 0));
    expect(onFresh).not.toHaveBeenCalled();
  });

  it('офлайн-режим B: fetcher НИКОГДА не резолвится + песня в IDB -> кеш сразу', async () => {
    await seed(SONG, STALE_AGE_MS);
    const fetcher = vi.fn(() => new Promise<Song>(() => {}));

    const res = await readSongThroughSWR('42', fetcher);

    expect(res.song).toEqual(SONG);
    expect(res.revalidating).toBe(true);
  });

  it('navigator.onLine === false + пустой кеш -> OfflineNoDataError', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn(() => new Promise<Song>(() => {}));

    await expect(readSongThroughSWR('swr-offline-empty', fetcher, { timeoutMs: 10 })).rejects.toBeInstanceOf(
      OfflineNoDataError
    );
  });

  it('navigator.onLine === false + протухший кеш -> сеть не трогаем', async () => {
    await seed(SONG, STALE_AGE_MS);
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn();

    const res = await readSongThroughSWR('42', fetcher);

    expect(res).toEqual({ song: SONG, fromCache: true, revalidating: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ошибка IDB не роняет путь — уходим в network-first', async () => {
    const fetcher = vi.fn().mockResolvedValue(SONG);
    const spy = vi.spyOn(dbModule, 'getDB').mockRejectedValue(new Error('IDB dead'));

    const res = await readSongThroughSWR('swr-idb-fail', fetcher);

    expect(res.song).toEqual(SONG);
    spy.mockRestore();
  });
});
