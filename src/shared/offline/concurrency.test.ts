import { describe, expect, it } from 'vitest';
import { forEachWithConcurrency } from './concurrency';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('forEachWithConcurrency', () => {
  it('обрабатывает все элементы, в полёте не больше limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];

    await forEachWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      seen.push(n);
      inFlight--;
    });

    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it('пустой список — без вызовов', async () => {
    let calls = 0;
    await forEachWithConcurrency([], 4, async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });

  it('первый сбой отклоняет результат и не запускает новые вызовы', async () => {
    const started: number[] = [];

    await expect(
      forEachWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
        started.push(n);
        await tick();
        if (n === 1) throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // 1 и 2 стартовали вместе; после сбоя 1 воркер 2 мог взять ещё один — не больше.
    expect(started.length).toBeLessThanOrEqual(3);
  });
});
