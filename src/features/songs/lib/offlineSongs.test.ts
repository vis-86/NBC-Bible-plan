// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSongThrough, getCachedSong, persistCachedSong } from './offlineSongs';
import { __resetDBConnection } from '@/shared/offline/db';
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
