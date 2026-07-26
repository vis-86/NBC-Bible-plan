// @ts-nocheck - Directus SDK typing issue with custom schema (см. src/lib/directus-data.ts):
// коллекции в DirectusSchema типизированы объектами (не массивами), из-за чего SDK v20
// сужает collection-параметр readItems/readItem до never. Экспортируемые функции при этом
// типизированы для потребителей (роутов) — проверка отключена только внутри файла.
/**
 * Серверный доступ к коллекциям `setlists`/`setlist_items` через admin-клиент Directus.
 * Клиент в Directus напрямую не ходит — только через эти функции + BFF-роуты (arch: proxy).
 */
import { createItem, createItems, deleteItem, deleteItems, readItem, readItems, updateItem } from '@directus/sdk';
import { getDirectusAdminClient } from '@/lib/directus';

const LOG = '[Setlists API]';

export interface SetlistSummary {
  id: string;
  title: string;
  date: string | null;
  itemCount: number;
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

type SetlistRow = { id: string; title: string; date: string | null; date_created: string };
type SetlistItemRow = { id: string; setlist: string; song: number | null; sort: number };
type SongRow = { id: number; title: string; subtitle?: string | null; song_key?: string | null };

/** `date` ASC NULLS LAST, тай-брейк `date_created` DESC. Directus не выражает NULLS LAST в query — сортируем в JS. */
function compareSetlists(a: SetlistRow, b: SetlistRow): number {
  if (a.date && b.date) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  } else if (a.date && !b.date) {
    return -1;
  } else if (!a.date && b.date) {
    return 1;
  }
  return a.date_created < b.date_created ? 1 : a.date_created > b.date_created ? -1 : 0;
}

/** Список сетов с числом песен. Каталог маленький — считаем items в памяти, без агрегирующих запросов. */
export async function getSetlistsList(): Promise<SetlistSummary[]> {
  const client = getDirectusAdminClient();
  const [setlists, items]: [SetlistRow[], SetlistItemRow[]] = await Promise.all([
    client.request(readItems('setlists', { fields: ['id', 'title', 'date', 'date_created'], limit: -1 })),
    client.request(readItems('setlist_items', { fields: ['setlist'], limit: -1 })),
  ]);

  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.setlist, (counts.get(item.setlist) ?? 0) + 1);
  }

  const sorted = [...setlists].sort(compareSetlists);
  console.debug(`${LOG} list: ${sorted.length} setlist(s)`);
  return sorted.map((row) => ({
    id: row.id,
    title: row.title,
    date: row.date,
    itemCount: counts.get(row.id) ?? 0,
  }));
}

/** Деталь сета: сам сет + items, отсортированные по `sort`, с краткими данными песен. null — не найден. */
export async function getSetlistDetail(id: string): Promise<SetlistDetail | null> {
  const client = getDirectusAdminClient();

  let setlist: SetlistRow;
  try {
    setlist = await client.request(readItem('setlists', id, { fields: ['id', 'title', 'date'] }));
  } catch (error) {
    console.debug(`${LOG} detail: setlist ${id} not found`, error instanceof Error ? error.message : error);
    return null;
  }
  if (!setlist) return null;

  const rawItems: SetlistItemRow[] = await client.request(
    readItems('setlist_items', {
      filter: { setlist: { _eq: id } },
      fields: ['id', 'song', 'sort'],
      sort: ['sort'],
      limit: -1,
    })
  );

  const orphans = rawItems.filter((item) => item.song === null);
  for (const orphan of orphans) {
    console.warn(`${LOG} orphan item ${orphan.id} in setlist ${id}`);
  }
  const validItems = rawItems.filter((item): item is SetlistItemRow & { song: number } => item.song !== null);

  const songIds = validItems.map((item) => item.song);
  const songs: SongRow[] =
    songIds.length > 0
      ? await client.request(
          readItems('songs', { filter: { id: { _in: songIds } }, fields: ['id', 'title', 'subtitle', 'song_key'] })
        )
      : [];
  const songById = new Map(songs.map((song) => [song.id, song]));

  const items: SetlistDetailItem[] = validItems
    .map((item) => {
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

export interface CreateSetlistInput {
  title: string;
  date: string | null;
  songIds: number[];
  createdBy: string;
}

/** Создаёт сет + items (`sort = index`). При сбое создания items удаляет уже созданный сет (компенсация). */
export async function createSetlist(input: CreateSetlistInput): Promise<string> {
  const client = getDirectusAdminClient();
  const created: { id: string } = await client.request(
    createItem('setlists', { title: input.title, date: input.date, created_by: input.createdBy })
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
    await client.request(deleteItem('setlists', created.id)).catch((cleanupError) => {
      console.error(`${LOG} create: compensation delete failed for ${created.id}`, cleanupError);
    });
    if (isForeignKeyViolation(error)) throw new UnknownSongIdError();
    throw error;
  }

  console.debug(`${LOG} create by ${input.createdBy}: ${input.songIds.length} songs`);
  return created.id;
}

export interface UpdateSetlistInput {
  title?: string;
  date?: string | null;
  songIds?: number[];
}

/** PATCH заменяет состав целиком при переданном `songIds` (не диффит) — см. план, раздел «Архитектура». */
export async function updateSetlist(id: string, input: UpdateSetlistInput): Promise<void> {
  const client = getDirectusAdminClient();

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.date !== undefined) patch.date = input.date;
  if (Object.keys(patch).length > 0) {
    await client.request(updateItem('setlists', id, patch));
  }

  if (input.songIds !== undefined) {
    await client.request(deleteItems('setlist_items', { filter: { setlist: { _eq: id } } }));
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

  console.debug(`${LOG} update ${id}`);
}

/** Удаляет сет; items уходят по FK CASCADE (руками не чистить). */
export async function deleteSetlist(id: string): Promise<void> {
  const client = getDirectusAdminClient();
  await client.request(deleteItems('setlists', [id]));
  console.debug(`${LOG} delete ${id}`);
}
