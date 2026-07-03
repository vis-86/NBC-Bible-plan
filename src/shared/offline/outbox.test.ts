// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));
vi.mock('@/shared/services/api/graphql', async () => {
  const actual = await vi.importActual<typeof import('@/shared/services/api/graphql')>(
    '@/shared/services/api/graphql'
  );
  return { ...actual, graphqlClient: { mutate: mutateMock, query: vi.fn() } };
});

import {
  enqueueSingleProgress,
  enqueueBatchProgress,
  getPendingOutbox,
  getPendingOutboxOverlay,
} from './outbox';
import { __deleteDB } from './db';

describe('offline/outbox', () => {
  beforeEach(async () => {
    await __deleteDB();
    mutateMock.mockReset();
  });

  it('успешная немедленная отправка single-мутации убирает запись из очереди', async () => {
    mutateMock.mockResolvedValue({ day: 5, count: 2, completedItems: [1, 2], success: true });

    await enqueueSingleProgress(5, 2, [1, 2]);

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(await getPendingOutbox()).toEqual([]);
  });

  it('неудачная отправка single-мутации оставляет запись в очереди и не бросает', async () => {
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(enqueueSingleProgress(5, 2, [1, 2])).resolves.toBeUndefined();

    const pending = await getPendingOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ op: 'single', dayIds: [5], count: 2 });
  });

  it('неудачная batch-мутация оставляет запись в очереди и не бросает', async () => {
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(enqueueBatchProgress([1, 2, 3], true)).resolves.toBeUndefined();

    const pending = await getPendingOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ op: 'batch', dayIds: [1, 2, 3], completed: true });
  });

  it('успешная batch-мутация убирает запись из очереди', async () => {
    mutateMock.mockResolvedValue({ days: [1, 2], completed: true, success: true });

    await enqueueBatchProgress([1, 2], true);

    expect(await getPendingOutbox()).toEqual([]);
  });

  it('getPendingOutboxOverlay строит оверлей из pending single- и batch-записей (LWW по ts)', async () => {
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await enqueueBatchProgress([10, 11], true);
    await enqueueSingleProgress(11, 3, [1, 2, 3]);

    const overlay = await getPendingOutboxOverlay();
    expect(overlay.get(10)).toEqual({ count: null, completedItems: null });
    // day 11 затронут и batch (completed=true → count:null), и более поздним single (count:3) — побеждает поздняя запись
    expect(overlay.get(11)).toEqual({ count: 3, completedItems: [1, 2, 3] });
  });
});
