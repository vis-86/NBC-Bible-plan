import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetlistSummary } from '../types';

const { readSetlistMock, warmSongsMock } = vi.hoisted(() => ({
  readSetlistMock: vi.fn(),
  warmSongsMock: vi.fn(),
}));

vi.mock('./offlineSetlists', () => ({ readSetlistThroughSWR: readSetlistMock }));
vi.mock('./warmSetlistSongs', () => ({ warmSetlistSongs: warmSongsMock }));

import { resetWarmedSetlists, warmSetlistsOffline } from './warmSetlistsOffline';

const TODAY = '2026-10-30';
const summary = (id: string, date: string | null, songIds = [1]): SetlistSummary => ({
  id,
  title: id,
  date,
  items: songIds.map((songId) => ({ songId, title: `song-${songId}` })),
});

describe('warmSetlistsOffline', () => {
  beforeEach(() => {
    resetWarmedSetlists();
    readSetlistMock.mockReset();
    warmSongsMock.mockReset();
    readSetlistMock.mockImplementation(async (id: string) => ({ setlist: { id, title: id, date: null, items: [] }, fromCache: false }));
    warmSongsMock.mockResolvedValue({ total: 0, warmed: 0, skipped: 0 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('греет деталь каждого сета; песни — кроме архивных', async () => {
    await warmSetlistsOffline([summary('future', '2026-11-01'), summary('undated', null), summary('past', '2026-10-01')], TODAY);
    expect(readSetlistMock.mock.calls.map(([id]) => id)).toEqual(['future', 'undated', 'past']);
    expect(warmSongsMock.mock.calls.map(([id]) => id)).toEqual(['future', 'undated']);
  });

  it('повторный список того же состава не греется; изменённый состав — греется', async () => {
    await warmSetlistsOffline([summary('a', null)], TODAY);
    await warmSetlistsOffline([summary('a', null)], TODAY);
    expect(readSetlistMock).toHaveBeenCalledTimes(1);

    await warmSetlistsOffline([summary('a', null, [1, 2])], TODAY);
    expect(readSetlistMock).toHaveBeenCalledTimes(2);
  });

  it('сбой одного сета не роняет остальные и греется на следующем списке', async () => {
    readSetlistMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await warmSetlistsOffline([summary('a', null), summary('b', null)], TODAY);
    expect(warmSongsMock.mock.calls.map(([id]) => id)).toEqual(['b']);

    await warmSetlistsOffline([summary('a', null), summary('b', null)], TODAY);
    expect(readSetlistMock.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'a']);
  });

  it('заведомый офлайн — сеть не трогаем', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await warmSetlistsOffline([summary('a', null)], TODAY);
    expect(readSetlistMock).not.toHaveBeenCalled();
  });
});
