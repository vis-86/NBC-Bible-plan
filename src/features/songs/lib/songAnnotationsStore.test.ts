// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/shared/offline/outbox', () => ({ enqueueSongAnnotations: enqueueMock }));

import { __deleteDB, __resetDBConnection } from '@/shared/offline/db';
import { resetNetworkSuspicionForTests } from '@/shared/offline/networkHealth';
import {
  EMPTY_SONG_ANNOTATIONS,
  getCachedAnnotations,
  persistAnnotations,
  readAnnotations,
  songStateKey,
  writeAnnotations,
} from './songAnnotationsStore';
import type { SongStroke } from '../types';

const stroke: SongStroke = {
  id: 's1',
  tool: 'pen',
  anchor: { section: 0, line: 1 },
  points: [[1, 2, 0.5]],
  color: '#000',
  width: 3,
};

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

beforeEach(async () => {
  await __deleteDB();
  __resetDBConnection();
  resetNetworkSuspicionForTests();
  enqueueMock.mockClear();
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ключ стора', () => {
  it('писатель и читатель ходят одним ключом', async () => {
    await persistAnnotations(42, { strokes: [stroke], updatedAt: 100 });
    expect(songStateKey(42)).toBe(songStateKey('42'));
    expect(await getCachedAnnotations('42')).toEqual({ strokes: [stroke], updatedAt: 100 });
  });
});

describe('readAnnotations', () => {
  it('успех сети кладёт пометки в IDB', async () => {
    const result = await readAnnotations(1, async () => ({ strokes: [stroke], updatedAt: 7 }));
    expect(result.strokes).toEqual([stroke]);
    expect(await getCachedAnnotations(1)).toMatchObject({ updatedAt: 7 });
  });

  it('fetcher падает, а запись уже в IDB — отдаём её', async () => {
    await persistAnnotations(1, { strokes: [stroke], updatedAt: 5 });
    const result = await readAnnotations(1, async () => {
      throw new Error('network down');
    });
    expect(result).toEqual({ strokes: [stroke], updatedAt: 5 });
  });

  it('fetcher падает и кэша нет — пустой набор, а не ошибка', async () => {
    await expect(
      readAnnotations(1, async () => {
        throw new Error('network down');
      })
    ).resolves.toEqual(EMPTY_SONG_ANNOTATIONS);
  });

  it('офлайн: fetch НИКОГДА не резолвится, кэш есть — не ждём сеть', async () => {
    setOnline(false);
    await persistAnnotations(1, { strokes: [stroke], updatedAt: 9 });
    const result = await readAnnotations(1, () => new Promise<never>(() => {}), 10);
    expect(result.updatedAt).toBe(9);
  });

  it('офлайн: fetch НИКОГДА не резолвится, кэша нет — пустой набор по таймауту', async () => {
    setOnline(false);
    const result = await readAnnotations(1, () => new Promise<never>(() => {}), 10);
    expect(result).toEqual(EMPTY_SONG_ANNOTATIONS);
  });
});

describe('writeAnnotations', () => {
  it('пишет в IDB и ставит в очередь', async () => {
    const saved = await writeAnnotations(42, [stroke]);
    expect(await getCachedAnnotations(42)).toMatchObject({ updatedAt: saved.updatedAt });
    expect(enqueueMock).toHaveBeenCalledWith(42, { strokes: [stroke], updatedAt: saved.updatedAt });
  });

  it('две записи в одном тике получают РАЗНЫЕ метки — иначе LWW их не различит', async () => {
    const first = await writeAnnotations(1, [stroke]);
    const second = await writeAnnotations(1, []);
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
  });
});
