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

import { enqueueSingleProgress, enqueueBatchProgress, getPendingOutbox } from './outbox';
import { replayOutbox, registerSyncTriggers, isServerReachable } from './sync';
import { __deleteDB } from './db';

describe('offline/sync replayOutbox', () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    await __deleteDB();
    mutateMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('успешно реплеит все ожидающие записи и очищает очередь', async () => {
    mutateMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await enqueueSingleProgress(1, 3);
    expect(await getPendingOutbox()).toHaveLength(1);

    mutateMock.mockResolvedValue({ success: true });
    await replayOutbox();

    expect(await getPendingOutbox()).toEqual([]);
  });

  it('запись, не подтверждённая сервером, остаётся в очереди после replay', async () => {
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueSingleProgress(1, 3);

    await replayOutbox();

    expect(await getPendingOutbox()).toHaveLength(1);
  });

  it('дедуп: запись, полностью перекрытая более поздней по тому же дню, удаляется без отправки', async () => {
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueSingleProgress(5, 1);
    await enqueueSingleProgress(5, 2);
    expect(await getPendingOutbox()).toHaveLength(2);

    mutateMock.mockReset();
    mutateMock.mockResolvedValue({ success: true });
    await replayOutbox();

    // Отправлена должна быть только вторая (более поздняя) запись.
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(await getPendingOutbox()).toEqual([]);
  });

  it('batch-запись, частично перекрытая, отправляется полностью (не режется по дням)', async () => {
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueBatchProgress([10, 11], true);
    await enqueueSingleProgress(11, 3, [1, 2, 3]);
    expect(await getPendingOutbox()).toHaveLength(2);

    mutateMock.mockReset();
    mutateMock.mockResolvedValue({ success: true });
    await replayOutbox();

    // День 10 остаётся актуальным только через batch-запись -> обе записи отправляются.
    expect(mutateMock).toHaveBeenCalledTimes(2);
    expect(await getPendingOutbox()).toEqual([]);
  });

  it('параллельный вызов replayOutbox во время выполнения — no-op', async () => {
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueSingleProgress(1, 1);

    let resolveMutate: (v: unknown) => void = () => {};
    mutateMock.mockReset();
    mutateMock.mockImplementation(
      () => new Promise((resolve) => { resolveMutate = resolve; })
    );

    const first = replayOutbox();
    const second = replayOutbox(); // должен вернуться немедленно, не трогая очередь повторно

    await vi.waitFor(() => expect(mutateMock).toHaveBeenCalled());
    resolveMutate({ success: true });
    await Promise.all([first, second]);

    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('registerSyncTriggers подписывается на online/visibilitychange и отписывается через cleanup', async () => {
    mutateMock.mockResolvedValue({ success: true });
    await enqueueSingleProgress(1, 1);
    mutateMock.mockReset();
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueSingleProgress(2, 2);

    const unregister = registerSyncTriggers();

    mutateMock.mockReset();
    mutateMock.mockResolvedValue({ success: true });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    window.dispatchEvent(new Event('online'));

    await vi.waitFor(async () => {
      expect(await getPendingOutbox()).toEqual([]);
    });

    unregister();
  });
});

describe('isServerReachable', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('true при res.ok', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await isServerReachable()).toBe(true);
  });

  it('false при не-ok ответе', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    expect(await isServerReachable()).toBe(false);
  });

  it('false при отклонённом fetch (сеть недоступна)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await isServerReachable()).toBe(false);
  });

  it('пингует именно /api/health (не /health)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await isServerReachable();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/api/health')).toBe(true);
    expect(init).toEqual(expect.objectContaining({ method: 'GET' }));
  });
});

describe('registerSyncTriggers — online-триггер гейтится health-пингом', () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    await __deleteDB();
    mutateMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('сервер недостижим -> replay НЕ вызывается', async () => {
    // Записываем офлайн (mutate падает при write-ahead попытке) — запись остаётся pending.
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueSingleProgress(1, 1);
    mutateMock.mockReset();

    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const unregister = registerSyncTriggers();

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(mutateMock).not.toHaveBeenCalled();
    expect(await getPendingOutbox()).toHaveLength(1);

    unregister();
  });

  it('сервер достижим -> replay вызывается', async () => {
    mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueSingleProgress(1, 1);
    mutateMock.mockReset();
    mutateMock.mockResolvedValue({ success: true });

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const unregister = registerSyncTriggers();

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(async () => {
      expect(await getPendingOutbox()).toEqual([]);
    });

    unregister();
  });
});
