/**
 * Серверный доступ к коллекциям `setlists`/`setlist_items` через admin-клиент Directus.
 * Клиент в Directus напрямую не ходит — только через эти функции + BFF-роуты (arch: proxy).
 *
 * Админ-токен видит сеты всех команд, поэтому каждая функция принимает `teamId` и
 * ограничивает им каждый запрос: `setlists` — по полю `team`, `setlist_items` — через
 * связь с сетом (`setlist.team`), песни сета — по `songs.team`. `teamId` — только из
 * `requireTeam` (членство по сессии), никогда из запроса.
 */
import { createItem, createItems, deleteItems, readItems, updateItems } from '@directus/sdk';
import type { DirectusClient, RestClient } from '@directus/sdk';
import { getDirectusAdminClient } from '@/lib/directus';
import { createHash } from 'node:crypto';

/** Короткий стабильный хеш строки — только для сравнения версий, не для безопасности. */
function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 12);
}

const LOG = '[Setlists API]';

export interface SetlistSummaryItem {
  songId: number;
  title: string;
  songKey?: string;
}

export interface SetlistSummary {
  id: string;
  title: string;
  date: string | null;
  items: SetlistSummaryItem[];
}

export interface SetlistDetailItem {
  id: string;
  sort: number;
  songId: number;
  title: string;
  subtitle?: string;
  songKey?: string;
}

export interface SetlistDetail {
  id: string;
  title: string;
  date: string | null;
  items: SetlistDetailItem[];
}

type SetlistRow = {
  id: string;
  title: string;
  date: string | null;
  date_created: string;
  /** Заполняется Directus при правке самого сета; правка состава его НЕ трогает. */
  date_updated: string | null;
  created_by: string;
  /** Команда-владелец сета (uuid `teams.id`). */
  team: string | null;
};
/** `setlist` — M2O на `setlists`: объектная ветка типа нужна для фильтра по `setlist.team`. */
type SetlistItemRow = { id: string; setlist: string | SetlistRow; song: number | null; sort: number };
type SongRow = { id: number; title: string; subtitle?: string | null; song_key?: string | null; team: string | null };

/**
 * Локальная схема для admin-клиента. В общей `DirectusSchema` (`src/lib/directus-schema.ts`)
 * коллекции описаны объектами вместо массивов — SDK v20 из-за этого сужает collection-параметр
 * `readItems`/`readItem` до `never` (раньше файл был целиком под `@ts-nocheck`). Описываем
 * массивами ровно те три коллекции, которые нужны здесь, — запросы ниже типизируются по-настоящему.
 */
interface SetlistsSchema {
  setlists: SetlistRow[];
  setlist_items: SetlistItemRow[];
  songs: SongRow[];
}

type SetlistsClient = DirectusClient<SetlistsSchema> & RestClient<SetlistsSchema>;

/** Поля, которых достаточно для сортировки списка (запрос тянет именно их). */
type SetlistSortFields = Pick<SetlistRow, 'date' | 'date_created'>;
/** Item в том виде, в каком его читает деталь сета (без `setlist` — он известен из фильтра). */
type SetlistItemBrief = Pick<SetlistItemRow, 'id' | 'song' | 'sort'>;

/** Тот же admin-клиент, но типизированный локальной схемой (см. `SetlistsSchema`). */
function getClient(): SetlistsClient {
  return getDirectusAdminClient() as unknown as SetlistsClient;
}

/**
 * `{ team: { _eq: undefined } }` сериализуется в `{ team: {} }`, и Directus отдал бы строки
 * всех команд, — поэтому пустой `teamId` останавливает запрос, а не уходит фильтром.
 */
function assertTeamId(teamId: unknown): asserts teamId is string {
  if (typeof teamId !== 'string' || teamId.trim() === '') {
    throw new Error('teamId is required');
  }
}

/** Фильтр позиций по сетам команды — через M2O `setlist_items.setlist` (своего `team` у позиций нет). */
function teamItemsFilter(teamId: string, setlistId?: string) {
  return {
    setlist: setlistId === undefined ? { team: { _eq: teamId } } : { id: { _eq: setlistId }, team: { _eq: teamId } },
  };
}

/** Сет есть и принадлежит команде. Сбой Directus пробрасывается: ошибка — не «нет сета». */
async function isTeamSetlist(client: SetlistsClient, teamId: string, id: string): Promise<boolean> {
  const rows = await client.request(
    readItems('setlists', { fields: ['id'], filter: { id: { _eq: id }, team: { _eq: teamId } }, limit: 1 })
  );
  return rows.length > 0;
}

/**
 * Все `songIds` — песни команды; одним запросом, до любой записи. FK проверяет только
 * существование песни, а сет может ссылаться лишь на песни своей команды.
 */
async function assertTeamSongs(client: SetlistsClient, teamId: string, songIds: number[]): Promise<void> {
  const unique = [...new Set(songIds)];
  if (unique.length === 0) return;
  const rows = await client.request(
    readItems('songs', { fields: ['id'], filter: { id: { _in: unique }, team: { _eq: teamId } }, limit: -1 })
  );
  const found = new Set(rows.map((row) => Number(row.id)));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    console.warn(`${LOG} songs not in team ${teamId}: [${missing.join(', ')}]`);
    throw new UnknownSongIdError();
  }
}

/** `date` ASC NULLS LAST, тай-брейк `date_created` DESC. Directus не выражает NULLS LAST в query — сортируем в JS. */
function compareSetlists(a: SetlistSortFields, b: SetlistSortFields): number {
  if (a.date && b.date) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  } else if (a.date && !b.date) {
    return -1;
  } else if (!a.date && b.date) {
    return 1;
  }
  return a.date_created < b.date_created ? 1 : a.date_created > b.date_created ? -1 : 0;
}

/**
 * Список сетов вместе с составом (карточка показывает песни сразу). Каталог маленький —
 * читаем все items и все нужные песни тремя запросами и сшиваем в памяти, без агрегатов
 * и без N запросов деталей.
 */
export async function getSetlistsList(teamId: string): Promise<SetlistSummary[]> {
  assertTeamId(teamId);
  const client = getClient();
  const [setlists, items] = await Promise.all([
    client.request(
      readItems('setlists', {
        fields: ['id', 'title', 'date', 'date_created'],
        filter: { team: { _eq: teamId } },
        limit: -1,
      })
    ),
    client.request(
      readItems('setlist_items', {
        fields: ['setlist', 'song', 'sort'],
        filter: teamItemsFilter(teamId),
        limit: -1,
        sort: ['sort'],
      })
    ),
  ]);

  const validItems = items.filter((item): item is SetlistItemRow & { setlist: string; song: number } => item.song !== null);
  const songIds = [...new Set(validItems.map((item) => item.song))];
  const songs: Pick<SongRow, 'id' | 'title' | 'song_key'>[] =
    songIds.length > 0
      ? await client.request(
          readItems('songs', {
            filter: { id: { _in: songIds }, team: { _eq: teamId } },
            fields: ['id', 'title', 'song_key'],
            limit: -1,
          })
        )
      : [];
  const songById = new Map(songs.map((song) => [song.id, song]));

  const bySetlist = new Map<string, SetlistSummaryItem[]>();
  for (const item of validItems) {
    const song = songById.get(item.song);
    // Песню удалили из каталога или она другой команды — строка не рендерится.
    if (!song) continue;
    const list = bySetlist.get(item.setlist) ?? [];
    list.push({ songId: song.id, title: song.title, songKey: song.song_key ?? undefined });
    bySetlist.set(item.setlist, list);
  }

  const sorted = [...setlists].sort(compareSetlists);
  console.debug(`${LOG} list: ${sorted.length} setlist(s)`);
  return sorted.map((row) => ({
    id: row.id,
    title: row.title,
    date: row.date,
    items: bySetlist.get(row.id) ?? [],
  }));
}

/**
 * Деталь сета: сам сет + items, отсортированные по `sort`, с краткими данными песен.
 * null — нет такого сета или он другой команды (неразличимо). Сбой Directus пробрасывается
 * (роут → 500): пустой ответ значит «нет», ошибка — ошибка.
 */
export async function getSetlistDetail(teamId: string, id: string): Promise<SetlistDetail | null> {
  assertTeamId(teamId);
  const client = getClient();

  const [setlist] = await client.request(
    readItems('setlists', { fields: ['id', 'title', 'date'], filter: { id: { _eq: id }, team: { _eq: teamId } }, limit: 1 })
  );
  if (!setlist) {
    console.debug(`${LOG} detail: setlist ${id} not found in team ${teamId}`);
    return null;
  }

  const rawItems: SetlistItemBrief[] = await client.request(
    readItems('setlist_items', {
      filter: teamItemsFilter(teamId, id),
      fields: ['id', 'song', 'sort'],
      sort: ['sort'],
      limit: -1,
    })
  );

  const orphans = rawItems.filter((item) => item.song === null);
  for (const orphan of orphans) {
    console.warn(`${LOG} orphan item ${orphan.id} in setlist ${id}`);
  }
  const validItems = rawItems.filter((item): item is SetlistItemBrief & { song: number } => item.song !== null);

  const songIds = validItems.map((item) => item.song);
  // Песня другой команды ведёт себя как удалённая: позиция не рендерится.
  const songs: Pick<SongRow, 'id' | 'title' | 'subtitle' | 'song_key'>[] =
    songIds.length > 0
      ? await client.request(
          readItems('songs', {
            filter: { id: { _in: songIds }, team: { _eq: teamId } },
            fields: ['id', 'title', 'subtitle', 'song_key'],
          })
        )
      : [];
  const songById = new Map(songs.map((song) => [song.id, song]));

  const items: SetlistDetailItem[] = validItems
    .map((item): SetlistDetailItem | null => {
      const song = songById.get(item.song);
      if (!song) return null;
      return {
        id: item.id,
        sort: item.sort,
        songId: song.id,
        title: song.title,
        subtitle: song.subtitle ?? undefined,
        songKey: song.song_key ?? undefined,
      };
    })
    .filter((item): item is SetlistDetailItem => item !== null);

  return { id: setlist.id, title: setlist.title, date: setlist.date, items };
}

export class UnknownSongIdError extends Error {
  constructor() {
    super('Unknown song id');
    this.name = 'UnknownSongIdError';
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  const errors = (error as { errors?: unknown })?.errors;
  const text = `${JSON.stringify(errors ?? '')} ${
    error instanceof Error ? error.message : String(error)
  }`.toLowerCase();
  return (
    text.includes('foreign key') ||
    text.includes('violates') ||
    text.includes('does not exist') ||
    text.includes('not found')
  );
}

/** Сета нет или он другой команды (неразличимо): роут отвечает 404, ничего не изменено. */
export class SetlistNotFoundError extends Error {
  constructor(id: string) {
    super(`setlist ${id} not found`);
    this.name = 'SetlistNotFoundError';
  }
}

/** Запрос к одному сету команды — для записи и удаления по фильтру, а не по голому id. */
function teamSetlistQuery(teamId: string, id: string) {
  return { filter: { id: { _eq: id }, team: { _eq: teamId } } };
}

export interface CreateSetlistInput {
  /** Команда из `requireTeam`; сет создаётся в ней. */
  teamId: string;
  title: string;
  date: string | null;
  songIds: number[];
  createdBy: string;
}

/**
 * Создаёт сет команды + items (`sort = index`). Песни проверяются на принадлежность команде
 * до первой записи. При сбое создания items удаляет уже созданный сет (компенсация).
 */
export async function createSetlist(input: CreateSetlistInput): Promise<string> {
  assertTeamId(input.teamId);
  const { teamId } = input;
  const client = getClient();
  await assertTeamSongs(client, teamId, input.songIds);

  const created: { id: string } = await client.request(
    createItem('setlists', { title: input.title, date: input.date, created_by: input.createdBy, team: teamId })
  );

  try {
    await client.request(
      createItems(
        'setlist_items',
        input.songIds.map((songId, index) => ({ setlist: created.id, song: songId, sort: index }))
      )
    );
  } catch (error) {
    console.error(`${LOG} create: item creation failed, compensating (delete setlist ${created.id})`, error);
    await client.request(deleteItems('setlists', teamSetlistQuery(teamId, created.id))).catch((cleanupError) => {
      console.error(`${LOG} create: compensation delete failed for ${created.id}`, cleanupError);
    });
    if (isForeignKeyViolation(error)) throw new UnknownSongIdError();
    throw error;
  }

  console.debug(`${LOG} create by ${input.createdBy} in team ${teamId}: ${input.songIds.length} songs`);
  return created.id;
}

export interface UpdateSetlistInput {
  title?: string;
  date?: string | null;
  songIds?: number[];
}

/**
 * PATCH заменяет состав целиком при переданном `songIds` (не диффит) — см. план, раздел «Архитектура».
 *
 * До любой записи: сет принадлежит команде (иначе `SetlistNotFoundError`) и все `songIds` —
 * песни команды (иначе `UnknownSongIdError`).
 */
export async function updateSetlist(teamId: string, id: string, input: UpdateSetlistInput): Promise<void> {
  assertTeamId(teamId);
  const client = getClient();

  if (!(await isTeamSetlist(client, teamId, id))) {
    console.debug(`${LOG} update: setlist ${id} not found in team ${teamId}`);
    throw new SetlistNotFoundError(id);
  }
  if (input.songIds !== undefined) await assertTeamSongs(client, teamId, input.songIds);

  const patch: Partial<SetlistRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.date !== undefined) patch.date = input.date;
  if (Object.keys(patch).length > 0) {
    await client.request(updateItems('setlists', teamSetlistQuery(teamId, id), patch));
  }

  if (input.songIds !== undefined) {
    await client.request(deleteItems('setlist_items', { filter: teamItemsFilter(teamId, id) }));
    try {
      await client.request(
        createItems(
          'setlist_items',
          input.songIds.map((songId, index) => ({ setlist: id, song: songId, sort: index }))
        )
      );
    } catch (error) {
      console.error(`${LOG} update: item creation failed for setlist ${id}`, error);
      if (isForeignKeyViolation(error)) throw new UnknownSongIdError();
      throw error;
    }
  }

  console.debug(`${LOG} update ${id} in team ${teamId}`);
}

/**
 * Удаляет сет команды; items уходят по FK CASCADE (руками не чистить). Сета нет или он
 * другой команды — `SetlistNotFoundError`, ничего не удаляется.
 */
export async function deleteSetlist(teamId: string, id: string): Promise<void> {
  assertTeamId(teamId);
  const client = getClient();
  if (!(await isTeamSetlist(client, teamId, id))) {
    console.debug(`${LOG} delete: setlist ${id} not found in team ${teamId}`);
    throw new SetlistNotFoundError(id);
  }
  await client.request(deleteItems('setlists', teamSetlistQuery(teamId, id)));
  console.debug(`${LOG} delete ${id} in team ${teamId}`);
}

/**
 * Версии сетов для sync-манифеста.
 *
 * ЛОВУШКА: правка состава меняет `setlist_items`, а НЕ `setlists.date_updated` — версия
 * по одному лишь `date_updated` пропустила бы ровно то изменение, ради которого сет и
 * открывают. Поэтому версия = короткий хеш от `date_updated` сета + его отсортированного
 * состава (`itemId:sort:songId`).
 *
 * Только сеты команды и их позиции: манифест одной команды не перечисляет сеты другой.
 */
export async function getSetlistVersions(teamId: string): Promise<Array<[string, string]>> {
  assertTeamId(teamId);
  const client = getClient();
  const [setlists, items] = await Promise.all([
    client.request(
      readItems('setlists', { fields: ['id', 'date_updated', 'date_created'], filter: { team: { _eq: teamId } }, limit: -1 })
    ),
    client.request(
      readItems('setlist_items', { fields: ['id', 'setlist', 'song', 'sort'], filter: teamItemsFilter(teamId), limit: -1 })
    ),
  ]);

  const bySetlist = new Map<string, string[]>();
  for (const item of items) {
    const list = bySetlist.get(item.setlist) ?? [];
    list.push(`${item.id}:${item.sort}:${item.song}`);
    bySetlist.set(item.setlist, list);
  }

  const versions = setlists.map((row): [string, string] => {
    const composition = (bySetlist.get(row.id) ?? []).sort().join('|');
    const stamp = String(row.date_updated ?? row.date_created ?? '');
    return [row.id, shortHash(`${stamp}#${composition}`)];
  });

  console.debug(`${LOG} versions: ${versions.length} setlist(s)`);
  return versions;
}
