import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

// readItems/readItem возвращают дескриптор {opts}, который мы инспектируем в тесте.
vi.mock('@directus/sdk', () => ({
  readItems: (_collection: string, opts: unknown) => ({ kind: 'list', opts }),
  readItem: (_collection: string, id: unknown, opts: unknown) => ({ kind: 'item', id, opts }),
}));

vi.mock('@/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: requestMock }),
}));

import { getSongsList } from './songsServer';

beforeEach(() => {
  requestMock.mockReset();
});

describe('getSongsList', () => {
  it('запрашивает tempo и time и мапит их в карточку', async () => {
    requestMock.mockResolvedValueOnce([
      { id: 1, title: 'Аллилуйя', subtitle: 'ориг', song_key: 'G', tempo: 72, time: '4/4' },
    ]);

    const list = await getSongsList();

    // поля запроса включают tempo/time (иначе в списке они всегда undefined)
    const query = requestMock.mock.calls[0][0] as { opts: { fields: string[] } };
    expect(query.opts.fields).toEqual(expect.arrayContaining(['tempo', 'time']));

    expect(list[0]).toMatchObject({ id: '1', key: 'G', tempo: '72', time: '4/4' });
  });
});
