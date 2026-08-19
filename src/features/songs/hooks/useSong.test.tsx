// @vitest-environment jsdom
import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';

const { readSWRMock, getSongMock } = vi.hoisted(() => ({
  readSWRMock: vi.fn(),
  getSongMock: vi.fn(),
}));

vi.mock('../lib/offlineSongs', () => ({ readSongThroughSWR: readSWRMock }));
vi.mock('@/shared/services/api/endpoints', () => ({ songsApi: { getSong: getSongMock } }));

import { useSong } from './useSong';

const SONG: Song = {
  id: '7',
  title: 'Великий Бог',
  key: 'G',
  content: '{soc}\n[G]Строка\n{eoc}',
};

describe('useSong — cache-first + предложение обновить', () => {
  beforeEach(() => {
    readSWRMock.mockReset();
    getSongMock.mockReset();
  });

  it('идентичная свежая версия применяется молча, freshAvailable не поднимается', async () => {
    let emitFresh: ((song: Song) => void) | undefined;
    readSWRMock.mockImplementation((_id, _fetcher, options) => {
      emitFresh = options?.onFresh;
      return Promise.resolve({ song: SONG, fromCache: true, revalidating: true });
    });

    const { result } = renderHook(() => useSong('7'));
    await waitFor(() => expect(result.current.song).toEqual(SONG));

    // Тот же контент, но другой объект — «изменением» это считаться не должно.
    act(() => emitFresh?.({ ...SONG }));

    expect(result.current.freshAvailable).toBe(false);
  });

  it('изменившийся контент поднимает freshAvailable, но НЕ подменяет лист', async () => {
    let emitFresh: ((song: Song) => void) | undefined;
    readSWRMock.mockImplementation((_id, _fetcher, options) => {
      emitFresh = options?.onFresh;
      return Promise.resolve({ song: SONG, fromCache: true, revalidating: true });
    });
    const fresh: Song = { ...SONG, content: '{soc}\n[A]Другая строка\n{eoc}' };

    const { result } = renderHook(() => useSong('7'));
    await waitFor(() => expect(result.current.song).toEqual(SONG));

    act(() => emitFresh?.(fresh));

    expect(result.current.freshAvailable).toBe(true);
    expect(result.current.song).toEqual(SONG);

    act(() => result.current.applyFresh());

    expect(result.current.song).toEqual(fresh);
    expect(result.current.freshAvailable).toBe(false);
  });

  it('попадание в кеш не показывает скелет (loading остаётся false после чтения)', async () => {
    // Отдельный id: module-кэш показанных песен живёт между тестами файла.
    const other: Song = { ...SONG, id: 'cache-only' };
    readSWRMock.mockResolvedValue({ song: other, fromCache: true, revalidating: false });

    const { result } = renderHook(() => useSong('cache-only'));

    await waitFor(() => expect(result.current.song).toEqual(other));
    expect(result.current.loading).toBe(false);
  });
});
