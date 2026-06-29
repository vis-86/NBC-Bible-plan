import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, __resetRateLimitStore } from './rate-limiter';

describe('rate-limiter', () => {
  beforeEach(() => __resetRateLimitStore());

  it('allows up to the limit, blocks beyond it', () => {
    const key = 'test:ip';
    expect(checkRateLimit(key, 3, 60_000)).toBe(true); // 1
    expect(checkRateLimit(key, 3, 60_000)).toBe(true); // 2
    expect(checkRateLimit(key, 3, 60_000)).toBe(true); // 3
    expect(checkRateLimit(key, 3, 60_000)).toBe(false); // 4 — blocked
  });

  it('resets after the window elapses', () => {
    const key = 'test:window';
    expect(checkRateLimit(key, 1, 10)).toBe(true);
    expect(checkRateLimit(key, 1, 10)).toBe(false);
    // ждём истечения окна
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit(key, 1, 10)).toBe(true);
        resolve();
      }, 20);
    });
  });

  it('isolates different keys', () => {
    expect(checkRateLimit('a', 1, 60_000)).toBe(true);
    expect(checkRateLimit('b', 1, 60_000)).toBe(true);
    expect(checkRateLimit('a', 1, 60_000)).toBe(false);
  });
});
