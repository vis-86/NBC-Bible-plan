import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

// Команды SDK возвращают дескрипторы, которые мы инспектируем в тесте.
vi.mock('@directus/sdk', () => ({
  readItems: (collection: string, opts: unknown) => ({ kind: 'read', collection, opts }),
  createItem: (collection: string, item: unknown) => ({ kind: 'create', collection, item }),
  createItems: (collection: string, items: unknown) => ({ kind: 'createMany', collection, item: items }),
  updateItems: (collection: string, query: unknown, item: unknown) => ({ kind: 'update', collection, opts: query, item }),
  deleteItems: (collection: string, query: unknown) => ({ kind: 'delete', collection, opts: query }),
}));

vi.mock('@/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: requestMock }),
}));

import {
  createSetlist,
  deleteSetlist,
  getSetlistDetail,
  getSetlistsList,
  getSetlistVersions,
  SetlistNotFoundError,
  UnknownSongIdError,
  updateSetlist,
} from './setlistsServer';

type Command = {
  kind: string;
  collection: string;
  item?: unknown;
  opts?: { fields?: string[]; filter?: Record<string, unknown>; limit?: number } | string[];
};

const SET_ID = '11111111-1111-1111-1111-111111111111';

function command(callIndex: number): Command {
  return requestMock.mock.calls[callIndex][0] as Command;
}

function commands(): Command[] {
  return requestMock.mock.calls.map(([cmd]) => cmd as Command);
}

function filterOf(cmd: Command): Record<string, unknown> | undefined {
  return Array.isArray(cmd.opts) ? undefined : cmd.opts?.filter;
}

/** Ограничение команды есть в фильтре запроса — напрямую (`team`) или через связь (`setlist.team`). */
function hasTeamConstraint(cmd: Command, teamId: string): boolean {
  return JSON.stringify(filterOf(cmd) ?? null).includes(JSON.stringify({ team: { _eq: teamId } }).slice(1, -1));
}

beforeEach(() => {
  requestMock.mockReset();
});

describe('teamId обязателен: пустой не уходит фильтром в Directus', () => {
  const calls: Array<[string, (teamId: unknown) => Promise<unknown>]> = [
    ['getSetlistsList', (t) => getSetlistsList(t as string)],
    ['getSetlistDetail', (t) => getSetlistDetail(t as string, SET_ID)],
    ['createSetlist', (t) => createSetlist({ teamId: t as string, title: 'Сет', date: null, songIds: [1], createdBy: 'u' })],
    ['updateSetlist', (t) => updateSetlist(t as string, SET_ID, { title: 'Сет' })],
    ['deleteSetlist', (t) => deleteSetlist(t as string, SET_ID)],
    ['getSetlistVersions', (t) => getSetlistVersions(t as string)],
  ];

  for (const [name, call] of calls) {
    for (const bad of [undefined, '', '   ', 42]) {
      it(`${name}(${JSON.stringify(bad)}) -> Error('teamId is required'), без запросов`, async () => {
        await expect(call(bad)).rejects.toThrow('teamId is required');
        expect(requestMock).not.toHaveBeenCalled();
      });
    }
  }
});

describe('каждый запрос к setlists / setlist_items / songs ограничен командой', () => {
  it('полный круг всех функций: чтения, правки и удаления несут фильтр команды', async () => {
    requestMock.mockImplementation(async (cmd: Command) => {
      if (cmd.kind === 'read' && cmd.collection === 'setlists') return [{ id: SET_ID, title: 'Сет', date: null, date_created: '2026-01-01' }];
      if (cmd.kind === 'read' && cmd.collection === 'songs') return [{ id: 1, title: 'Песня' }];
      if (cmd.kind === 'read' && cmd.collection === 'setlist_items') return [{ id: 'i1', setlist: SET_ID, song: 1, sort: 0 }];
      if (cmd.kind === 'create') return { id: SET_ID };
      return [];
    });

    await getSetlistsList('team-a');
    await getSetlistDetail('team-a', SET_ID);
    await createSetlist({ teamId: 'team-a', title: 'Сет', date: null, songIds: [1], createdBy: 'u' });
    await updateSetlist('team-a', SET_ID, { title: 'Новое', songIds: [1] });
    await deleteSetlist('team-a', SET_ID);
    await getSetlistVersions('team-a');

    const scoped = commands().filter((cmd) => cmd.kind === 'read' || cmd.kind === 'update' || cmd.kind === 'delete');
    expect(scoped.length).toBeGreaterThan(0);
    for (const cmd of scoped) {
      expect(hasTeamConstraint(cmd, 'team-a'), `${cmd.kind} ${cmd.collection}: ${JSON.stringify(cmd.opts)}`).toBe(true);
    }
    // Создание сета пишет команду в саму строку.
    const created = commands().find((cmd) => cmd.kind === 'create' && cmd.collection === 'setlists');
    expect(created?.item).toMatchObject({ team: 'team-a' });
  });
});

describe('getSetlistsList', () => {
  it('сеты по team, позиции по setlist.team, песни по id и team', async () => {
    requestMock
      .mockResolvedValueOnce([{ id: 's1', title: 'Сет', date: null, date_created: '2026-01-01' }])
      .mockResolvedValueOnce([
        { setlist: 's1', song: 1, sort: 0 },
        { setlist: 's1', song: 2, sort: 1 },
      ])
      // Песня 2 другой команды: Directus с фильтром team её не вернёт.
      .mockResolvedValueOnce([{ id: 1, title: 'Своя', song_key: 'C' }]);

    const list = await getSetlistsList('team-a');

    expect(command(0)).toMatchObject({ collection: 'setlists', opts: { filter: { team: { _eq: 'team-a' } } } });
    expect(command(1)).toMatchObject({ collection: 'setlist_items', opts: { filter: { setlist: { team: { _eq: 'team-a' } } } } });
    expect(command(2)).toMatchObject({
      collection: 'songs',
      opts: { filter: { id: { _in: [1, 2] }, team: { _eq: 'team-a' } } },
    });
    expect(list).toEqual([{ id: 's1', title: 'Сет', date: null, items: [{ songId: 1, title: 'Своя', songKey: 'C' }] }]);
  });
});

describe('getSetlistDetail', () => {
  it('сет ищется по id и команде одной строкой; нет строки -> null без дальнейших запросов', async () => {
    requestMock.mockResolvedValueOnce([]);

    expect(await getSetlistDetail('team-a', SET_ID)).toBeNull();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(command(0)).toMatchObject({
      kind: 'read',
      collection: 'setlists',
      opts: { filter: { id: { _eq: SET_ID }, team: { _eq: 'team-a' } }, limit: 1 },
    });
  });

  it('позиции — по id сета и его команде; песня другой команды ведёт себя как сирота', async () => {
    requestMock
      .mockResolvedValueOnce([{ id: SET_ID, title: 'Сет', date: '2026-08-01' }])
      .mockResolvedValueOnce([
        { id: 'i1', song: 1, sort: 0 },
        { id: 'i2', song: 2, sort: 1 },
      ])
      .mockResolvedValueOnce([{ id: 1, title: 'Своя', subtitle: null, song_key: 'G' }]);

    const detail = await getSetlistDetail('team-a', SET_ID);

    expect(command(1)).toMatchObject({
      collection: 'setlist_items',
      opts: { filter: { setlist: { id: { _eq: SET_ID }, team: { _eq: 'team-a' } } } },
    });
    expect(command(2)).toMatchObject({ collection: 'songs', opts: { filter: { id: { _in: [1, 2] }, team: { _eq: 'team-a' } } } });
    expect(detail?.items.map((item) => item.songId)).toEqual([1]);
  });

  it('сбой Directus пробрасывается, а не превращается в null', async () => {
    requestMock.mockRejectedValueOnce(new Error('directus down'));
    await expect(getSetlistDetail('team-a', SET_ID)).rejects.toThrow('directus down');
  });
});

describe('createSetlist', () => {
  const input = { teamId: 'team-a', title: 'Сет', date: null, songIds: [3, 1], createdBy: 'user-1' };

  it('песня другой команды -> UnknownSongIdError, ни одной записи', async () => {
    requestMock.mockResolvedValueOnce([{ id: 3 }]); // песни 1 в команде нет

    await expect(createSetlist(input)).rejects.toBeInstanceOf(UnknownSongIdError);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(command(0)).toMatchObject({ collection: 'songs', opts: { filter: { id: { _in: [3, 1] }, team: { _eq: 'team-a' } } } });
    expect(commands().some((cmd) => cmd.kind.startsWith('create'))).toBe(false);
  });

  it('пишет team из входа; позиции — по порядку songIds', async () => {
    requestMock
      .mockResolvedValueOnce([{ id: 1 }, { id: 3 }])
      .mockResolvedValueOnce({ id: 'new-set' })
      .mockResolvedValueOnce([]);

    expect(await createSetlist(input)).toBe('new-set');
    expect(command(1)).toMatchObject({
      kind: 'create',
      collection: 'setlists',
      item: { title: 'Сет', date: null, created_by: 'user-1', team: 'team-a' },
    });
    expect(command(2)).toMatchObject({
      kind: 'createMany',
      collection: 'setlist_items',
      item: [
        { setlist: 'new-set', song: 3, sort: 0 },
        { setlist: 'new-set', song: 1, sort: 1 },
      ],
    });
  });

  it('компенсация удаляет созданный сет фильтром по id и команде', async () => {
    requestMock
      .mockResolvedValueOnce([{ id: 1 }, { id: 3 }])
      .mockResolvedValueOnce({ id: 'new-set' })
      .mockRejectedValueOnce(new Error('violates foreign key constraint'))
      .mockResolvedValueOnce(undefined);

    await expect(createSetlist(input)).rejects.toBeInstanceOf(UnknownSongIdError);
    expect(command(3)).toMatchObject({
      kind: 'delete',
      collection: 'setlists',
      opts: { filter: { id: { _eq: 'new-set' }, team: { _eq: 'team-a' } } },
    });
  });
});

describe('updateSetlist', () => {
  it('сет другой команды -> SetlistNotFoundError, изменений нет', async () => {
    requestMock.mockResolvedValueOnce([]);

    await expect(updateSetlist('team-a', SET_ID, { title: 'Новое', songIds: [1] })).rejects.toBeInstanceOf(
      SetlistNotFoundError
    );
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(command(0)).toMatchObject({
      kind: 'read',
      collection: 'setlists',
      opts: { filter: { id: { _eq: SET_ID }, team: { _eq: 'team-a' } }, limit: 1 },
    });
  });

  it('песня другой команды -> UnknownSongIdError до любой записи (и title не меняется)', async () => {
    requestMock.mockResolvedValueOnce([{ id: SET_ID }]).mockResolvedValueOnce([{ id: 1 }]);

    await expect(updateSetlist('team-a', SET_ID, { title: 'Новое', songIds: [1, 2] })).rejects.toBeInstanceOf(
      UnknownSongIdError
    );
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(commands().every((cmd) => cmd.kind === 'read')).toBe(true);
  });

  it('свой сет и свои песни: патч и замена состава ограничены командой', async () => {
    requestMock
      .mockResolvedValueOnce([{ id: SET_ID }])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    await updateSetlist('team-a', SET_ID, { title: 'Новое', songIds: [2, 1] });

    expect(command(2)).toMatchObject({
      kind: 'update',
      collection: 'setlists',
      opts: { filter: { id: { _eq: SET_ID }, team: { _eq: 'team-a' } } },
      item: { title: 'Новое' },
    });
    expect(command(3)).toMatchObject({
      kind: 'delete',
      collection: 'setlist_items',
      opts: { filter: { setlist: { id: { _eq: SET_ID }, team: { _eq: 'team-a' } } } },
    });
    expect(command(4)).toMatchObject({
      kind: 'createMany',
      item: [
        { setlist: SET_ID, song: 2, sort: 0 },
        { setlist: SET_ID, song: 1, sort: 1 },
      ],
    });
  });
});

describe('deleteSetlist', () => {
  it('сет другой команды -> SetlistNotFoundError, удаления нет', async () => {
    requestMock.mockResolvedValueOnce([]);

    await expect(deleteSetlist('team-a', SET_ID)).rejects.toBeInstanceOf(SetlistNotFoundError);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(command(0).kind).toBe('read');
  });

  it('свой сет удаляется фильтром по id и команде', async () => {
    requestMock.mockResolvedValueOnce([{ id: SET_ID }]).mockResolvedValueOnce(undefined);

    await deleteSetlist('team-a', SET_ID);

    expect(command(1)).toMatchObject({
      kind: 'delete',
      collection: 'setlists',
      opts: { filter: { id: { _eq: SET_ID }, team: { _eq: 'team-a' } } },
    });
  });
});

describe('getSetlistVersions', () => {
  it('сеты и позиции только команды', async () => {
    requestMock
      .mockResolvedValueOnce([{ id: 's1', date_updated: '2026-08-02T10:00:00Z', date_created: null }])
      .mockResolvedValueOnce([{ id: 'i1', setlist: 's1', song: 1, sort: 0 }]);

    const versions = await getSetlistVersions('team-a');

    expect(command(0)).toMatchObject({ collection: 'setlists', opts: { filter: { team: { _eq: 'team-a' } } } });
    expect(command(1)).toMatchObject({ collection: 'setlist_items', opts: { filter: { setlist: { team: { _eq: 'team-a' } } } } });
    expect(versions).toHaveLength(1);
    expect(versions[0][0]).toBe('s1');
  });
});
