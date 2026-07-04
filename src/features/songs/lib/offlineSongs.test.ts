// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSongThrough, getCachedSong, persistCachedSong } from './offlineSongs';
import { __resetDBConnection } from '@/shared/offline/db';
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
});
