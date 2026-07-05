// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readThrough, getApiCache, persistApiCache } from './readThrough';
import { __resetDBConnection } from './db';

describe('readThrough', () => {
  beforeEach(() => {
    __resetDBConnection();
  });

  it('при успешном fetcher кеширует и возвращает сетевой результат', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
    const result = await readThrough('key:a', fetcher);
    expect(result).toEqual({ items: [1, 2, 3] });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // ждём фоновую запись в IDB
    await new Promise((r) => setTimeout(r, 0));
    expect(await getApiCache('key:a')).toEqual({ items: [1, 2, 3] });
  });

  it('при сетевой ошибке отдаёт последний закешированный результат', async () => {
    await persistApiCache('key:b', { items: ['stale'] });
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await readThrough('key:b', fetcher);
    expect(result).toEqual({ items: ['stale'] });
  });

  it('пробрасывает исходную ошибку, если кеш пуст', async () => {
    const err = new TypeError('Failed to fetch');
    const fetcher = vi.fn().mockRejectedValue(err);

    await expect(readThrough('key:c', fetcher)).rejects.toBe(err);
  });

  it('ЗАВИСШАЯ сеть (реальный «офлайн» без reject) -> по таймауту отдаёт кеш', async () => {
    // Регрессионный тест: в мёртвой соте/Wi-Fi без аплинка fetch висит минутами —
    // без таймаута IDB-фолбэк не наступал и экран застревал на вечной загрузке.
    await persistApiCache('key:d', { items: ['from-idb'] });
    const fetcher = vi.fn(() => new Promise<unknown>(() => {})); // висит вечно

    const result = await readThrough('key:d', fetcher, 20);
    expect(result).toEqual({ items: ['from-idb'] });
  });

  it('ЗАВИСШАЯ сеть + кеш пуст -> дожидается медленную сеть, а не падает', async () => {
    const fetcher = vi.fn(
      () => new Promise<unknown>((resolve) => setTimeout(() => resolve({ items: ['slow'] }), 60))
    );

    const result = await readThrough('key:e', fetcher, 20);
    expect(result).toEqual({ items: ['slow'] });
  });
});
