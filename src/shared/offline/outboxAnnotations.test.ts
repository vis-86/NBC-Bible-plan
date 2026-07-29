// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));
vi.mock('@/shared/services/api/graphql', () => ({
  graphqlClient: { mutate: mutateMock },
  progressMutations: {
    updateProgress: (...args: unknown[]) => ({ op: 'updateProgress', args }),
    updateProgressBatch: (...args: unknown[]) => ({ op: 'updateProgressBatch', args }),
  },
}));

import { __deleteDB, __resetDBConnection, isProgressOutboxRecord } from './db';
import { enqueueSingleProgress, enqueueSongAnnotations, getPendingOutbox, getPendingOutboxOverlay } from './outbox';
import { replayOutbox } from './sync';

const fetchMock = vi.fn();

beforeEach(async () => {
  await __deleteDB();
  __resetDBConnection();
  mutateMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('обратная совместимость очереди', () => {
  it('запись БЕЗ kind читается как прогресс — старый неотправленный прогресс не теряется', () => {
    const legacy = { id: 'x', op: 'single' as const, dayIds: [3], count: 1, ts: 1 };
    expect(isProgressOutboxRecord(legacy)).toBe(true);
  });

  it('очередь прогресса продолжает синкаться после расширения union (регрессия)', async () => {
    mutateMock.mockRejectedValueOnce(new Error('offline'));
    await enqueueSingleProgress(7, 1, [2]);
    expect(await getPendingOutbox()).toHaveLength(1);

    mutateMock.mockResolvedValueOnce({});
    await replayOutbox();

    expect(mutateMock).toHaveBeenCalledTimes(2);
    expect(await getPendingOutbox()).toHaveLength(0);
  });

  it('оверлей прогресса игнорирует записи пометок и не падает на них', async () => {
    mutateMock.mockRejectedValue(new Error('offline'));
    fetchMock.mockRejectedValue(new Error('offline'));
    await enqueueSingleProgress(5, 2);
    await enqueueSongAnnotations(41, { strokes: [], updatedAt: 1 });

    const overlay = await getPendingOutboxOverlay();
    expect(overlay.size).toBe(1);
    expect(overlay.get(5)).toEqual({ count: 2, completedItems: null });
  });
});

describe('очередь пометок', () => {
  it('офлайн: запись остаётся в очереди и уходит при появлении сети', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await enqueueSongAnnotations(41, { strokes: [], updatedAt: 10 });
    expect(await getPendingOutbox()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    await replayOutbox();
    expect(await getPendingOutbox()).toHaveLength(0);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain('/api/songs/41/state');
    expect(init.method).toBe('PUT');
  });

  it('повторная правка той же песни ЗАМЕНЯЕТ запись в очереди, а не копит их', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await enqueueSongAnnotations(41, { strokes: [], updatedAt: 10 });
    await enqueueSongAnnotations(41, { strokes: [], updatedAt: 20 });

    const pending = await getPendingOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: 'songAnnotations', payload: { updatedAt: 20 } });
  });

  it('разные песни живут в очереди независимо', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await enqueueSongAnnotations(41, { strokes: [], updatedAt: 10 });
    await enqueueSongAnnotations(70, { strokes: [], updatedAt: 11 });
    expect(await getPendingOutbox()).toHaveLength(2);
  });

  it('4xx не зацикливает очередь — запись снимается', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    await enqueueSongAnnotations(41, { strokes: [], updatedAt: 10 });
    expect(await getPendingOutbox()).toHaveLength(0);
  });
});
