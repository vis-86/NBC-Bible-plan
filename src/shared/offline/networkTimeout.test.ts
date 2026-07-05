import { describe, expect, it } from 'vitest';
import { NetworkTimeoutError, isNetworkTimeout, raceWithTimeout } from './networkTimeout';

describe('raceWithTimeout', () => {
  it('возвращает результат promise, успевшего раньше таймаута', async () => {
    await expect(raceWithTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('пробрасывает ошибку promise, упавшего раньше таймаута', async () => {
    const err = new TypeError('Failed to fetch');
    await expect(raceWithTimeout(Promise.reject(err), 1000)).rejects.toBe(err);
  });

  it('зависший promise отклоняется NetworkTimeoutError по истечении таймаута', async () => {
    const hang = new Promise<never>(() => {});
    await expect(raceWithTimeout(hang, 10)).rejects.toBeInstanceOf(NetworkTimeoutError);
  });

  it('isNetworkTimeout отличает таймаут от прочих ошибок', () => {
    expect(isNetworkTimeout(new NetworkTimeoutError(10))).toBe(true);
    expect(isNetworkTimeout(new TypeError('Failed to fetch'))).toBe(false);
  });
});
