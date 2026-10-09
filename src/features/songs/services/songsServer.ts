// @ts-nocheck - Directus SDK typing issue with custom schema (см. src/lib/directus-data.ts):
// коллекции в DirectusSchema типизированы объектами (не массивами), из-за чего SDK v20
// сужает collection-параметр readItems/readItem до never. Экспортируемые функции при этом
// типизированы для потребителей (роутов) — проверка отключена только внутри файла.
/**
 * Серверный доступ к коллекции `songs` через admin-клиент Directus.
 * Маппит поле `song_key` (Directus) → `key` (доменный тип Song).
 * Клиент в Directus напрямую не ходит — только через эти функции + API-роуты (arch: proxy).
 */
import { createItem, readItem, readItems, updateItem } from '@directus/sdk';
import { getDirectusAdminClient } from '@/lib/directus';
import type { CreateSongInput, UpdateSongInput } from '@/lib/validators/songs.schemas';
import { chordProToPlainText } from '../lib/searchText';
import { buildSongSlug, nextFreeSlug } from '../lib/songSlug';
import type { Song, SongSummary } from '../types';

const LOG = '[Songs API]';

type SongRow = {
  id: number;
  title: string;
  subtitle?: string | null;
  song_key?: string | null;
  default_key?: string | null;
  tempo?: number | null;
  time?: string | null;
  content?: string;
  visibility?: 'public' | 'members' | null;
};

const DETAIL_FIELDS = ['id', 'title', 'subtitle', 'song_key', 'default_key', 'tempo', 'time', 'content'];

function toSummary(row: SongRow): SongSummary {
  return {
    id: String(row.id),
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    key: row.song_key ?? undefined,
    tempo: row.tempo != null ? String(row.tempo) : undefined,
    time: row.time ?? undefined,
  };
}

function toSong(row: SongRow): Song {
  return {
    ...toSummary(row),
    // Основная тональность (§10.1) — только в детали: в списке она не запрашивается.
    defaultKey: row.default_key ?? undefined,
    content: row.content ?? '',
    visibility: row.visibility ?? 'public',
  };
}

/**
 * Список песен (краткие карточки) для страницы каталога и клиентского поиска.
 *
 * `content` запрашивается ради поискового текста, но наружу уходит только очищенный
 * `plainText` (без аккордов и директив) — иначе вес `songs:list`, который целиком лежит
 * в офлайн-кэше, вырос бы вдвое без пользы.
 */
export async function getSongsList(): Promise<SongSummary[]> {
  const client = getDirectusAdminClient();
  const rows: SongRow[] = await client.request(
    readItems('songs', {
      fields: ['id', 'title', 'subtitle', 'song_key', 'tempo', 'time', 'content'],
      filter: { status: { _eq: 'published' } },
      sort: ['sort', 'title'],
      limit: -1,
    }),
  );

  const songs = rows.map((row) => ({
    ...toSummary(row),
    // Песня без контента остаётся в списке: искать по названию она не мешает.
    plainText: chordProToPlainText(row.content ?? ''),
  }));

  // Кириллица в UTF-8 — два байта на символ, поэтому байты, а не длина строки.
  const indexBytes = songs.reduce((sum, s) => sum + Buffer.byteLength(s.plainText ?? '', 'utf8'), 0);
  console.debug(`${LOG} list: ${songs.length} song(s), search text ~${Math.round(indexBytes / 1024)} KB`);
  return songs;
}

/** Одна песня с полным ChordPro-контентом, либо null если не найдена. */
export async function getSongById(id: number): Promise<Song | null> {
  const client = getDirectusAdminClient();
  try {
    const row: SongRow = await client.request(
      readItem('songs', id, { fields: [...DETAIL_FIELDS, 'visibility'] }),
    );
    return row ? toSong(row) : null;
  } catch (error) {
    // Directus кидает 403/404 для отсутствующего id — трактуем как "не найдено".
    console.debug(`${LOG} detail: song ${id} not found`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Песня для публичной ссылки `/s?id=` — без сессии. Отдаётся только опубликованная и
 * открытая всем; иначе null, и роут отвечает тем же 404, что на несуществующий id, —
 * гость не должен отличать «закрыта» от «нет такой». `visibility` наружу не уходит.
 */
export async function getPublicSong(id: number): Promise<Song | null> {
  const client = getDirectusAdminClient();
  const rows: SongRow[] = await client.request(
    readItems('songs', {
      fields: DETAIL_FIELDS,
      filter: { id: { _eq: id }, status: { _eq: 'published' }, visibility: { _eq: 'public' } },
      limit: 1,
    }),
  );
  if (rows.length === 0) {
    console.debug(`${LOG} public: song ${id} not public or missing`);
    return null;
  }
  const song = toSong(rows[0]);
  delete song.visibility;
  return song;
}

/**
 * Версии песен для sync-манифеста: `[id, date_updated]`. `date_updated` — родное поле
 * Directus, отдельного счётчика версий заводить не нужно. Отдаём ВСЕ опубликованные id:
 * полный список заменяет tombstones — клиент удаляет из IDB всё, чего здесь нет.
 */
export async function getSongVersions(): Promise<Array<[string, string]>> {
  const client = getDirectusAdminClient();
  const rows: Array<{ id: number; date_updated?: string | null; date_created?: string | null }> =
    await client.request(
      readItems('songs', {
        fields: ['id', 'date_updated', 'date_created'],
        filter: { status: { _eq: 'published' } },
        sort: ['id'],
        limit: -1,
      }),
    );

  console.debug(`${LOG} versions: ${rows.length} song(s)`);
  // Песня, ни разу не правленная после импорта, имеет пустой date_updated — берём
  // date_created, иначе все такие песни делили бы одну «версию» и не обновлялись.
  return rows.map((row) => [String(row.id), String(row.date_updated ?? row.date_created ?? '')]);
}

/** Песни нет: отдельный класс, чтобы роут отличил 404 от отказа Directus. */
export class SongNotFoundError extends Error {
  constructor(id: number) {
    super(`song ${id} not found`);
    this.name = 'SongNotFoundError';
  }
}

/** Поля тела запроса → колонки Directus. Undefined-поля в патч не попадают. */
function toRow(input: Partial<CreateSongInput & UpdateSongInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.title !== undefined) row.title = input.title;
  if (input.subtitle !== undefined) row.subtitle = input.subtitle;
  if (input.songKey !== undefined) row.song_key = input.songKey;
  if (input.defaultKey !== undefined) row.default_key = input.defaultKey;
  if (input.tempo !== undefined) row.tempo = input.tempo;
  if (input.time !== undefined) row.time = input.time;
  if (input.content !== undefined) row.content = input.content;
  if (input.visibility !== undefined) row.visibility = input.visibility;
  return row;
}

/**
 * Создание песни (M9). Сервер сам задаёт три поля, которых нет в теле запроса:
 *
 * - `sort` = max + 1 — новая песня встаёт в конец каталога; в проде пустых `sort` нет;
 * - `slug` — NOT NULL + UNIQUE без дефолта, формат корпуса `{sort}-{название кебабом}`;
 * - `status: 'published'` — черновиков в модели нет (решение 1), а `draft` не попал бы
 *   ни в каталог, ни в sync-манифест: оба фильтруют по `published`.
 *
 * Версию песни поднимать не нужно: манифест считает её по `date_updated`/`date_created`.
 */
export async function createSong(input: CreateSongInput): Promise<number> {
  const client = getDirectusAdminClient();

  const [last]: Array<{ sort?: number | null }> = await client.request(
    readItems('songs', { fields: ['sort'], sort: ['-sort'], limit: 1 }),
  );
  const sort = (last?.sort ?? 0) + 1;

  const base = buildSongSlug(sort, input.title);
  const siblings: Array<{ slug: string }> = await client.request(
    readItems('songs', { fields: ['slug'], filter: { slug: { _starts_with: base } }, limit: -1 }),
  );
  const slug = nextFreeSlug(base, siblings.map((row) => row.slug));

  const created: { id: number } = await client.request(
    createItem('songs', { ...toRow(input), slug, sort, status: 'published' }),
  );

  console.debug(`${LOG} create: song ${created.id} (${slug})`);
  return created.id;
}

/**
 * Правка песни (M9). Патч частичный; `slug` не пересчитывается даже при смене
 * названия — это идентичность записи, по ней upsert'ит импортёр корпуса.
 * Конфликт двух редакторов — last-write-wins (решение 1).
 */
export async function updateSong(id: number, input: UpdateSongInput): Promise<void> {
  const client = getDirectusAdminClient();
  const row = toRow(input);

  try {
    await client.request(updateItem('songs', id, row));
  } catch (error) {
    // Directus отдаёт 403/404 на отсутствующий id — для клиента это «не найдено».
    if (isNotFound(error)) throw new SongNotFoundError(id);
    throw error;
  }

  console.debug(`${LOG} update: song ${id}, fields [${Object.keys(row).join(', ')}]`);
}

function isNotFound(error: unknown): boolean {
  const status = (error as { response?: { status?: number }; status?: number })?.response?.status
    ?? (error as { status?: number })?.status;
  if (status === 403 || status === 404) return true;

  const text = `${JSON.stringify((error as { errors?: unknown })?.errors ?? '')} ${
    error instanceof Error ? error.message : String(error)
  }`.toLowerCase();
  return text.includes('not found') || text.includes('forbidden');
}
