import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

// Команды SDK возвращают дескрипторы, которые мы инспектируем в тесте.
vi.mock('@directus/sdk', () => ({
  readItems: (collection: string, opts: unknown) => ({ kind: 'list', collection, opts }),
  readItem: (collection: string, id: unknown, opts: unknown) => ({ kind: 'item', collection, id, opts }),
  createItem: (collection: string, item: unknown) => ({ kind: 'create', collection, item }),
  updateItem: (collection: string, id: unknown, item: unknown) => ({ kind: 'update', collection, id, item }),
}));

vi.mock('@/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: requestMock }),
}));

import {
  CatalogSongNotFoundError,
  copySongToTeam,
  createSong,
  getCatalog,
  getSongById,
  getSongsList,
  getSongVersions,
  SongAlreadyCopiedError,
  SongNotFoundError,
  updateSong,
} from './songsServer';

type Command = {
  kind: string;
  collection: string;
  id?: unknown;
  item?: Record<string, unknown>;
  opts?: { fields?: string[]; filter?: Record<string, unknown>; limit?: number };
};

function command(callIndex: number): Command {
  return requestMock.mock.calls[callIndex][0] as Command;
}

beforeEach(() => {
  requestMock.mockReset();
});

describe('песни команды: фильтр team в каждом запросе к songs', () => {
  it('getSongsList фильтрует по команде и по published', async () => {
    requestMock.mockResolvedValueOnce([]);

    await getSongsList('team-a');

    expect(command(0)).toMatchObject({ kind: 'list', collection: 'songs' });
    expect(command(0).opts?.filter).toEqual({ status: { _eq: 'published' }, team: { _eq: 'team-a' } });
  });

  it('getSongById ищет по id и команде, одной строкой', async () => {
    requestMock.mockResolvedValueOnce([{ id: 7, title: 'Песня', content: '' }]);

    await getSongById('team-a', 7);

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(command(0)).toMatchObject({ kind: 'list', collection: 'songs' });
    expect(command(0).opts).toMatchObject({ filter: { id: { _eq: 7 }, team: { _eq: 'team-a' } }, limit: 1 });
  });

  it('getSongVersions отдаёт версии только своей команды', async () => {
    requestMock.mockResolvedValueOnce([{ id: 3, date_updated: '2026-08-01T10:00:00Z' }]);

    expect(await getSongVersions('team-a')).toEqual([['3', '2026-08-01T10:00:00Z']]);
    expect(command(0)).toMatchObject({ kind: 'list', collection: 'songs' });
    expect(command(0).opts?.filter).toEqual({ status: { _eq: 'published' }, team: { _eq: 'team-a' } });
  });
});

describe('getSongById: пусто и сбой различаются', () => {
  it('пустой ответ (нет песни или она другой команды) -> null', async () => {
    requestMock.mockResolvedValueOnce([]);
    expect(await getSongById('team-a', 7)).toBeNull();
  });

  it('сбой Directus пробрасывается, а не превращается в null', async () => {
    requestMock.mockRejectedValueOnce(new Error('directus down'));
    await expect(getSongById('team-a', 7)).rejects.toThrow('directus down');
  });
});

describe('createSong', () => {
  const input = { title: 'Новая песня', content: '[G]Слава' };

  it('пишет команду из аргумента и visibility members, если она не передана', async () => {
    requestMock.mockResolvedValueOnce([{ sort: 4 }]);
    requestMock.mockResolvedValueOnce([]);
    requestMock.mockResolvedValueOnce({ id: 5 });

    expect(await createSong('team-a', input)).toBe(5);

    expect(command(2)).toMatchObject({ kind: 'create', collection: 'songs' });
    expect(command(2).item).toMatchObject({ team: 'team-a', visibility: 'members', sort: 5, status: 'published' });
  });

  it('переданную visibility не меняет', async () => {
    requestMock.mockResolvedValueOnce([{ sort: 4 }]);
    requestMock.mockResolvedValueOnce([]);
    requestMock.mockResolvedValueOnce({ id: 5 });

    await createSong('team-a', { ...input, visibility: 'public' });

    expect(command(2).item).toMatchObject({ team: 'team-a', visibility: 'public' });
  });
});

describe('updateSong', () => {
  it('песня не своей команды -> SongNotFoundError, updateItem не вызывается', async () => {
    requestMock.mockResolvedValueOnce([]); // Directus не нашёл id в команде team-a

    await expect(updateSong('team-a', 12, { title: 'X' })).rejects.toBeInstanceOf(SongNotFoundError);

    expect(command(0).opts?.filter).toEqual({ id: { _eq: 12 }, team: { _eq: 'team-a' } });
    expect(requestMock.mock.calls.some(([cmd]) => (cmd as Command).kind === 'update')).toBe(false);
  });

  it('песня своей команды -> патч уходит в updateItem', async () => {
    requestMock.mockResolvedValueOnce([{ id: 12 }]);
    requestMock.mockResolvedValueOnce({ id: 12 });

    await updateSong('team-a', 12, { title: 'X' });

    expect(command(1)).toMatchObject({ kind: 'update', collection: 'songs', id: 12, item: { title: 'X' } });
  });
});

describe('getSongsList', () => {
  it('запрашивает tempo и time и мапит их в карточку', async () => {
    requestMock.mockResolvedValueOnce([
      { id: 1, title: 'Аллилуйя', subtitle: 'ориг', song_key: 'G', tempo: 72, time: '4/4' },
    ]);

    const list = await getSongsList('team-a');

    // поля запроса включают tempo/time (иначе в списке они всегда undefined)
    const query = requestMock.mock.calls[0][0] as { opts: { fields: string[] } };
    expect(query.opts.fields).toEqual(expect.arrayContaining(['tempo', 'time']));

    expect(list[0]).toMatchObject({ id: '1', key: 'G', tempo: '72', time: '4/4' });
  });

  it('не запрашивает default_key — списку тональность не нужна', async () => {
    requestMock.mockResolvedValueOnce([]);

    await getSongsList('team-a');

    const query = requestMock.mock.calls[0][0] as { opts: { fields: string[] } };
    expect(query.opts.fields).not.toContain('default_key');
  });
});

describe('getSongById', () => {
  it('запрашивает default_key и мапит его в defaultKey', async () => {
    requestMock.mockResolvedValueOnce([{ id: 1, title: 'Аллилуйя', song_key: 'G', default_key: 'A', content: '[G]текст' }]);

    const song = await getSongById('team-a', 1);

    const query = requestMock.mock.calls[0][0] as { opts: { fields: string[] } };
    expect(query.opts.fields).toEqual(expect.arrayContaining(['song_key', 'default_key']));

    expect(song).toMatchObject({ id: '1', key: 'G', defaultKey: 'A' });
  });

  it('пустой default_key приходит как undefined (⇒ действует исходная)', async () => {
    requestMock.mockResolvedValueOnce([{ id: 1, title: 'Аллилуйя', song_key: 'G', default_key: null, content: '' }]);

    const song = await getSongById('team-a', 1);

    expect(song?.defaultKey).toBeUndefined();
  });
});

describe('teamId обязателен в каждой функции команды', () => {
  const calls: Array<[string, (teamId: unknown) => Promise<unknown>]> = [
    ['getSongsList', (teamId) => getSongsList(teamId as string)],
    ['getSongById', (teamId) => getSongById(teamId as string, 7)],
    ['getSongVersions', (teamId) => getSongVersions(teamId as string)],
    ['createSong', (teamId) => createSong(teamId as string, { title: 'Песня', content: '' })],
    ['updateSong', (teamId) => updateSong(teamId as string, 7, { title: 'X' })],
    ['getCatalog', (teamId) => getCatalog(teamId as string)],
    ['copySongToTeam', (teamId) => copySongToTeam(teamId as string, 7)],
  ];

  it.each(calls)('%s: пустой или не строковый teamId -> ошибка, Directus не вызывается', async (_name, call) => {
    for (const teamId of [undefined, null, '', 42]) {
      await expect(call(teamId)).rejects.toThrow('teamId is required');
    }
    expect(requestMock).not.toHaveBeenCalled();
  });
});

type FakeRow = Record<string, unknown> & { id: number };

/** Условие фильтра Directus для одной колонки; `_neq` и NULL — как в SQL: NULL не проходит. */
function matches(value: unknown, condition: Record<string, unknown>): boolean {
  return Object.entries(condition).every(([op, expected]) => {
    if (op === '_eq') return value === expected;
    if (op === '_neq') return value != null && value !== expected;
    if (op === '_nnull') return value != null;
    if (op === '_starts_with') return String(value ?? '').startsWith(String(expected));
    throw new Error(`фейк не знает оператор ${op}`);
  });
}

/** Таблица `songs` в памяти: список применяет фильтр и limit, создание возвращает новый id. */
function fakeSongs(rows: FakeRow[]) {
  requestMock.mockImplementation(async (cmd: Command) => {
    if (cmd.kind === 'list') {
      const filter = (cmd.opts?.filter ?? {}) as Record<string, Record<string, unknown>>;
      const found = rows.filter((row) => Object.entries(filter).every(([key, cond]) => matches(row[key], cond)));
      return cmd.opts?.limit === -1 ? found : found.slice(0, cmd.opts?.limit ?? found.length);
    }
    if (cmd.kind === 'create') return { id: 100 };
    throw new Error(`фейк не знает команду ${cmd.kind}`);
  });
}

function createCalls(): Command[] {
  return requestMock.mock.calls.map(([cmd]) => cmd as Command).filter((cmd) => cmd.kind === 'create');
}

const published = { status: 'published', visibility: 'public', content: '' };

describe('getCatalog', () => {
  it('отдаёт только опубликованные public-песни других команд', async () => {
    fakeSongs([
      { id: 1, title: 'Своя открытая', team: 'team-a', ...published },
      { id: 2, title: 'Чужая открытая', team: 'team-b', ...published },
      { id: 3, title: 'Чужая закрытая', team: 'team-b', ...published, visibility: 'members' },
      { id: 4, title: 'Чужой черновик', team: 'team-b', ...published, status: 'draft' },
    ]);

    const songs = await getCatalog('team-a');

    expect(songs.map((song) => song.id)).toEqual(['2']);
  });

  it('сортирует по названию, берёт team.name и метку копии одним запросом по своим песням', async () => {
    requestMock.mockResolvedValueOnce([
      { id: 2, title: 'Аллилуйя', subtitle: null, song_key: 'G', team: { name: 'Церковь Б' } },
      { id: 5, title: 'Благодать', song_key: null, team: { name: 'Церковь В' } },
    ]);
    requestMock.mockResolvedValueOnce([{ id: 40, origin_song: 5 }]);

    const songs = await getCatalog('team-a');

    expect(command(0).opts).toMatchObject({ sort: ['title'], limit: -1 });
    expect(command(0).opts?.fields).toContain('team.name');
    expect(command(1).opts?.filter).toEqual({ team: { _eq: 'team-a' }, origin_song: { _nnull: true } });
    expect(songs).toEqual([
      { id: '2', title: 'Аллилуйя', key: 'G', teamName: 'Церковь Б' },
      { id: '5', title: 'Благодать', teamName: 'Церковь В', copiedAs: '40' },
    ]);
  });
});

describe('copySongToTeam', () => {
  const source = {
    id: 2,
    title: 'Чужая открытая',
    subtitle: 'ориг',
    song_key: 'G',
    default_key: 'A',
    tempo: 72,
    time: '4/4',
    content: '[G]Слава',
  };

  it('пишет копию в команду из аргумента: origin_song, visibility members, поля источника', async () => {
    // Directus вернул источник с лишними колонками — в копию они попасть не должны.
    requestMock.mockResolvedValueOnce([{ ...source, team: 'team-b', visibility: 'public', origin_song: 1, sort: 3 }]);
    requestMock.mockResolvedValueOnce([]); // копии ещё нет
    requestMock.mockResolvedValueOnce([{ sort: 4 }]);
    requestMock.mockResolvedValueOnce([]);
    requestMock.mockResolvedValueOnce({ id: 9 });

    expect(await copySongToTeam('team-a', 2)).toBe(9);

    expect(command(0).opts?.filter).toEqual({
      id: { _eq: 2 },
      status: { _eq: 'published' },
      visibility: { _eq: 'public' },
      team: { _neq: 'team-a' },
    });
    expect(command(1).opts?.filter).toEqual({ team: { _eq: 'team-a' }, origin_song: { _eq: 2 } });
    expect(command(4)).toMatchObject({ kind: 'create', collection: 'songs' });
    expect(command(4).item).toEqual({
      title: 'Чужая открытая',
      subtitle: 'ориг',
      song_key: 'G',
      default_key: 'A',
      tempo: 72,
      time: '4/4',
      content: '[G]Слава',
      origin_song: 2,
      visibility: 'members',
      team: 'team-a',
      slug: '5-чужая-открытая',
      sort: 5,
      status: 'published',
    });
  });

  it('песня уже скопирована -> SongAlreadyCopiedError с id нашей копии, новая не создаётся', async () => {
    fakeSongs([
      { id: 2, title: 'Чужая открытая', team: 'team-b', ...published },
      { id: 40, title: 'Чужая открытая', team: 'team-a', ...published, visibility: 'members', origin_song: 2 },
    ]);

    const error = await copySongToTeam('team-a', 2).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SongAlreadyCopiedError);
    expect((error as SongAlreadyCopiedError).existingId).toBe(40);
    expect(createCalls()).toHaveLength(0);
  });

  it('песня своей команды -> CatalogSongNotFoundError, даже если она public', async () => {
    fakeSongs([{ id: 1, title: 'Своя открытая', team: 'team-a', ...published }]);

    await expect(copySongToTeam('team-a', 1)).rejects.toBeInstanceOf(CatalogSongNotFoundError);
    expect(createCalls()).toHaveLength(0);
  });

  it.each([
    ['закрытая', { visibility: 'members' }],
    ['неопубликованная', { status: 'draft' }],
  ])('%s песня другой команды -> CatalogSongNotFoundError', async (_name, patch) => {
    fakeSongs([{ id: 2, title: 'Чужая', team: 'team-b', ...published, ...patch }]);

    await expect(copySongToTeam('team-a', 2)).rejects.toBeInstanceOf(CatalogSongNotFoundError);
    expect(createCalls()).toHaveLength(0);
  });

  it('несуществующая песня -> CatalogSongNotFoundError', async () => {
    fakeSongs([]);
    await expect(copySongToTeam('team-a', 999)).rejects.toBeInstanceOf(CatalogSongNotFoundError);
  });

  it('копию другой команды той же песни не считает своей', async () => {
    fakeSongs([
      { id: 2, title: 'Чужая открытая', team: 'team-b', ...published },
      { id: 41, title: 'Чужая открытая', team: 'team-c', ...published, visibility: 'members', origin_song: 2 },
    ]);

    expect(await copySongToTeam('team-a', 2)).toBe(100);
    expect(createCalls()[0].item).toMatchObject({ team: 'team-a', origin_song: 2, visibility: 'members' });
  });
});
