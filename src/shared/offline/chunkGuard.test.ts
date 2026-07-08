import { describe, expect, it } from 'vitest';
import { isChunkLoadFailure, shouldReload } from './chunkGuard';

describe('isChunkLoadFailure', () => {
  it('true для Error с name === ChunkLoadError', () => {
    const err = new Error('boom');
    err.name = 'ChunkLoadError';
    expect(isChunkLoadFailure(err)).toBe(true);
  });

  it.each([
    'Loading chunk 42 failed',
    'Failed to fetch dynamically imported module: https://app/x.js',
    'Importing a module script failed',
    'Loading CSS chunk 3 failed',
  ])('true для сообщения об ошибке: %s', (message) => {
    expect(isChunkLoadFailure(new Error(message))).toBe(true);
    expect(isChunkLoadFailure(message)).toBe(true);
  });

  it('false для обычной ошибки, не связанной с чанками', () => {
    expect(isChunkLoadFailure(new Error('TypeError: fetch failed'))).toBe(false);
  });

  it('false для undefined/null', () => {
    expect(isChunkLoadFailure(undefined)).toBe(false);
    expect(isChunkLoadFailure(null)).toBe(false);
  });

  it('false для пустой строки', () => {
    expect(isChunkLoadFailure('')).toBe(false);
  });
});

describe('shouldReload', () => {
  it('true когда ещё не перезагружались (lastReloadTs === null)', () => {
    expect(shouldReload(100_000, null, 60_000)).toBe(true);
  });

  it('false внутри cooldown-окна', () => {
    expect(shouldReload(100_000, 90_000, 60_000)).toBe(false);
  });

  it('true за пределами cooldown-окна', () => {
    expect(shouldReload(200_000, 90_000, 60_000)).toBe(true);
  });

  it('false ровно на границе cooldown (строгое >)', () => {
    expect(shouldReload(150_000, 90_000, 60_000)).toBe(false);
  });
});
