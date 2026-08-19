// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetlistItem } from '../types';

const { readSongSWRMock, getSongMock } = vi.hoisted(() => ({
  readSongSWRMock: vi.fn(),
  getSongMock: vi.fn(),
}));

vi.mock('@/features/songs/lib/offlineSongs', () => ({ readSongThroughSWR: readSongSWRMock }));
vi.mock('@/shared/services/api/endpoints', () => ({ songsApi: { getSong: getSongMock } }));

import { warmSetlistSongs } from './warmSetlistSongs';

function items(...songIds: number[]): SetlistItem[] {
  return songIds.map((songId, i) => ({ id: `i${i}`, songId, sort: i } as SetlistItem));
}

describe('warmSetlistSongs', () => {
  beforeEach(() => {
    readSongSWRMock.mockReset();
    getSongMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('офлайн: ни одного запроса, всё помечено пропущенным', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    const res = await warmSetlistSongs('s1', items(1, 2, 3));

    expect(readSongSWRMock).not.toHaveBeenCalled();
    expect(res).toEqual({ total: 3, warmed: 0, skipped: 3 });
  });

  it('греет каждую песню ровно один раз, дубликаты в составе схлопываются', async () => {
    readSongSWRMock.mockResolvedValue({ song: { id: '1' }, fromCache: false, revalidating: false });

    const res = await warmSetlistSongs('s1', items(1, 2, 1));

    expect(readSongSWRMock).toHaveBeenCalledTimes(2);
    expect(res.total).toBe(2);
    expect(res.warmed).toBe(2);
  });

  it('не превышает заданную конкурентность', async () => {
    let inFlight = 0;
    let peak = 0;
    readSongSWRMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve({ song: { id: 'x' }, fromCache: false, revalidating: false });
          }, 5);
        })
    );

    await warmSetlistSongs('s1', items(1, 2, 3, 4, 5, 6), 2);

    expect(peak).toBeLessThanOrEqual(2);
  });

  it('свежий кеш песни считается пропуском, сеть не нужна', async () => {
    readSongSWRMock.mockResolvedValue({ song: { id: '1' }, fromCache: true, revalidating: false });

    const res = await warmSetlistSongs('s1', items(1, 2));

    expect(res).toEqual({ total: 2, warmed: 0, skipped: 2 });
  });

  it('падение одной песни не роняет прогрев остальных', async () => {
    readSongSWRMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ song: { id: '2' }, fromCache: false, revalidating: false });

    const res = await warmSetlistSongs('s1', items(1, 2));

    expect(res.total).toBe(2);
    expect(res.warmed).toBe(1);
    expect(res.skipped).toBe(1);
  });
});
