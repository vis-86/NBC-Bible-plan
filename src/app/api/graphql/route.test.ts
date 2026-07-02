import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем сессию и Directus-клиент. SDK-функции мокаем как «дескрипторы»
// (возвращают распознаваемый объект), чтобы по аргументам `client.request`
// проверять, какие bulk-операции реально отправлены.
const { getSessionMock, requestMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  requestMock: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: getSessionMock,
}));
vi.mock('@/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: requestMock }),
}));
vi.mock('@directus/sdk', () => ({
  readItems: (collection: string, query: unknown) => ({ op: 'read', collection, query }),
  createItem: (collection: string, data: unknown) => ({ op: 'createItem', collection, data }),
  createItems: (collection: string, data: unknown) => ({ op: 'createItems', collection, data }),
  updateItem: (collection: string, key: unknown, data: unknown) => ({ op: 'updateItem', collection, key, data }),
  updateItems: (collection: string, keys: unknown, data: unknown) => ({ op: 'updateItems', collection, keys, data }),
  deleteItem: (collection: string, key: unknown) => ({ op: 'deleteItem', collection, key }),
  deleteItems: (collection: string, keys: unknown) => ({ op: 'deleteItems', collection, keys }),
}));

import { POST } from './route';

const currentYear = new Date().getFullYear();

function req(body: unknown) {
  return new Request('http://localhost/api/graphql', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

const BATCH_QUERY = `
  mutation UpdateProgressBatch($days: [Int!]!, $completed: Boolean!) {
    updateProgressBatch(days: $days, completed: $completed) { days completed success }
  }
`;

// Хелперы для чтения операций из вызовов requestMock.
const opsOf = (op: string) => requestMock.mock.calls.map((c) => c[0]).filter((cmd: any) => cmd.op === op);

describe('POST /api/graphql — UpdateProgressBatch', () => {
  beforeEach(() => {
    getSessionMock.mockReset().mockResolvedValue({ directus_id: 'u1' });
    requestMock.mockReset();
  });

  it('mark complete: creates missing days, updates existing, in bounded requests (not per-day)', async () => {
    // День 5 уже имеет строку, дни 6 и 7 — нет.
    requestMock.mockImplementation(async (cmd: any) => {
      if (cmd.op === 'read') return [{ id: 100, day: 5, count: 2 }];
      return {};
    });

    const res = await POST(req({ query: BATCH_QUERY, variables: { days: [5, 6, 7], completed: true } }));
    const json = await res.json();

    expect(json.data.updateProgressBatch.success).toBe(true);

    // Ровно одна bulk-вставка для отсутствующих дней (6, 7).
    const creates = opsOf('createItems');
    expect(creates).toHaveLength(1);
    expect(creates[0].data).toHaveLength(2);
    expect(creates[0].data.map((r: any) => r.day).sort()).toEqual([6, 7]);
    creates[0].data.forEach((r: any) => {
      expect(r).toMatchObject({ directus_user_id: 'u1', count: null, completed_items: null, year: currentYear });
    });

    // Ровно один bulk-update для существующего дня (id 100 → count:null).
    const updates = opsOf('updateItems');
    expect(updates).toHaveLength(1);
    expect(updates[0].keys).toEqual([100]);
    expect(updates[0].data).toMatchObject({ count: null, completed_items: null, year: currentYear });

    // Никаких вызовов «по дню» (updateItem/createItem/deleteItem).
    expect(opsOf('updateItem')).toHaveLength(0);
    expect(opsOf('createItem')).toHaveLength(0);

    // Всего запросов ограничено (read + create + update = 3), не растёт с числом дней.
    expect(requestMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('mark complete: deletes duplicate rows of the same day in a single request', async () => {
    requestMock.mockImplementation(async (cmd: any) => {
      if (cmd.op === 'read') {
        return [
          { id: 100, day: 5, count: 2 },
          { id: 101, day: 5, count: 1 }, // дубликат дня 5
        ];
      }
      return {};
    });

    await POST(req({ query: BATCH_QUERY, variables: { days: [5], completed: true } }));

    const updates = opsOf('updateItems');
    expect(updates[0].keys).toEqual([100]); // обновляем первую строку

    const deletes = opsOf('deleteItems');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].keys).toEqual([101]); // удаляем дубликат
  });

  it('unmark: deletes every matching row in a single deleteItems request', async () => {
    requestMock.mockImplementation(async (cmd: any) => {
      if (cmd.op === 'read') {
        return [
          { id: 100, day: 5 },
          { id: 101, day: 6 },
          { id: 102, day: 7 },
        ];
      }
      return {};
    });

    const res = await POST(req({ query: BATCH_QUERY, variables: { days: [5, 6, 7], completed: false } }));
    const json = await res.json();
    expect(json.data.updateProgressBatch.success).toBe(true);

    const deletes = opsOf('deleteItems');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].keys).toEqual([100, 101, 102]);
    expect(opsOf('createItems')).toHaveLength(0);
    expect(opsOf('updateItems')).toHaveLength(0);
  });

  it('filters reads by directus_user_id and current year', async () => {
    requestMock.mockImplementation(async (cmd: any) => (cmd.op === 'read' ? [] : {}));

    await POST(req({ query: BATCH_QUERY, variables: { days: [5], completed: true } }));

    const read = opsOf('read')[0];
    const and = read.query.filter._and;
    expect(and).toContainEqual({ directus_user_id: { _eq: 'u1' } });
    expect(and).toContainEqual({ year: { _eq: currentYear } });
    expect(and).toContainEqual({ day: { _in: [5] } });
    expect(read.query.limit).toBe(-1);
  });

  it('rejects invalid input (empty days / non-boolean completed)', async () => {
    requestMock.mockResolvedValue([]);

    const res1 = await POST(req({ query: BATCH_QUERY, variables: { days: [], completed: true } }));
    expect(res1.status).toBe(500);
    expect((await res1.json()).error).toMatch(/Invalid days/);

    const res2 = await POST(req({ query: BATCH_QUERY, variables: { days: [1], completed: 'yes' } }));
    expect(res2.status).toBe(500);
    expect((await res2.json()).error).toMatch(/Invalid completed/);
  });

  it('regression: batch query is NOT misrouted to the single-day branch despite the "updateProgress" substring', async () => {
    // Имя мутации содержит подстроку `updateProgress` — раньше single-day guard
    // (`query.includes('updateProgress')`) перехватывал батч и падал с
    // "Invalid day parameter". Здесь батч должен корректно отработать.
    requestMock.mockImplementation(async (cmd: any) => (cmd.op === 'read' ? [] : {}));

    const res = await POST(req({ query: BATCH_QUERY, variables: { days: [1, 2], completed: true } }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(json.data.updateProgressBatch).toMatchObject({ completed: true, success: true });
    // Ушли в батч-ветку: была bulk-вставка, а не одиночный createItem.
    expect(opsOf('createItems')).toHaveLength(1);
  });
});
