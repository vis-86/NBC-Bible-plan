// @ts-nocheck - Directus SDK typing issue with custom schema (см. src/lib/directus-data.ts):
// коллекции в DirectusSchema типизированы объектами (не массивами), из-за чего SDK v20
// сужает collection-параметр readItems/readItem до never. Экспортируемые функции при этом
// типизированы для потребителей (роутов) — проверка отключена только внутри файла.
/**
 * Серверный доступ к коллекции `songs` через admin-клиент Directus.
 * Маппит поле `song_key` (Directus) → `key` (доменный тип Song).
 * Клиент в Directus напрямую не ходит — только через эти функции + API-роуты (arch: proxy).
 *
 * Админ-токен видит песни всех команд, поэтому функции, читающие или пишущие песни
 * команды, принимают `teamId` первым аргументом и фильтруют по нему каждый запрос.
 * `teamId` — только из `requireTeam` (членство по сессии), никогда из запроса.
 */
import { createItem, readItems, updateItem } from '@directus/sdk';
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

/**
 * Пустой `teamId` недопустим: `{ team: { _eq: undefined } }` сериализуется в `{ team: {} }`,
 * то есть в запрос без фильтра по команде. Поэтому каждая функция с `teamId` начинает с этой проверки.
 */
function requireTeamId(teamId: unknown): void {
  if (typeof teamId !== 'string' || teamId === '') throw new Error('teamId is required');
}

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
export async function getSongsList(teamId: string): Promise<SongSummary[]> {
  requireTeamId(teamId);
  const client = getDirectusAdminClient();
  const rows: SongRow[] = await client.request(
    readItems('songs', {
      fields: ['id', 'title', 'subtitle', 'song_key', 'tempo', 'time', 'content'],
      filter: { status: { _eq: 'published' }, team: { _eq: teamId } },
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

/**
 * Одна песня команды с полным ChordPro-контентом, либо null. Песня другой команды и
 * несуществующий id неразличимы — оба null. Сбой Directus пробрасывается (роут → 500):
 * пустой ответ значит «нет», ошибка — ошибка.
 */
export async function getSongById(teamId: string, id: number): Promise<Song | null> {
  requireTeamId(teamId);
  const client = getDirectusAdminClient();
  const rows: SongRow[] = await client.request(
    readItems('songs', {
      fields: [...DETAIL_FIELDS, 'visibility'],
      filter: { id: { _eq: id }, team: { _eq: teamId } },
      limit: 1,
    }),
  );
  if (rows.length === 0) {
    console.debug(`${LOG} detail: song ${id} not found in team ${teamId}`);
    return null;
  }
  return toSong(rows[0]);
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
 * Версии песен команды для sync-манифеста: `[id, date_updated]`. `date_updated` — родное
 * поле Directus, отдельного счётчика версий заводить не нужно. Отдаём ВСЕ опубликованные
 * id команды: полный список заменяет tombstones — клиент удаляет из IDB всё, чего здесь нет.
 */
export async function getSongVersions(teamId: string): Promise<Array<[string, string]>> {
  requireTeamId(teamId);
  const client = getDirectusAdminClient();
  const rows: Array<{ id: number; date_updated?: string | null; date_created?: string | null }> =
    await client.request(
      readItems('songs', {
        fields: ['id', 'date_updated', 'date_created'],
        filter: { status: { _eq: 'published' }, team: { _eq: teamId } },
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
 * Создание песни (M9) в команде `teamId`. Сервер сам задаёт поля, которых нет в теле запроса:
 *
 * - `team` — команда из сессии;
 * - `sort` = max + 1 — новая песня встаёт в конец каталога; в проде пустых `sort` нет;
 * - `slug` — NOT NULL + UNIQUE без дефолта, формат корпуса `{sort}-{название кебабом}`;
 * - `status: 'published'` — черновиков в модели нет (решение 1), а `draft` не попал бы
 *   ни в каталог, ни в sync-манифест: оба фильтруют по `published`.
 *
 * `sort` и `slug` считаются по всем песням, не по команде: UNIQUE на `slug` глобальный.
 * `visibility` без значения в теле — `members`: публикация песни — осознанное действие,
 * дефолт колонки (`public`) при создании не используется.
 *
 * Версию песни поднимать не нужно: манифест считает её по `date_updated`/`date_created`.
 */
export async function createSong(teamId: string, input: CreateSongInput): Promise<number> {
  requireTeamId(teamId);
  return insertSong(teamId, input.title, { ...toRow(input), visibility: input.visibility ?? 'members' });
}

/**
 * Запись новой песни в команду — общая часть `createSong` и `copySongToTeam`: `team`, `sort`,
 * `slug` и `status` задаёт сервер (см. `createSong`) поверх переданных колонок.
 */
async function insertSong(teamId: string, title: string, fields: Record<string, unknown>): Promise<number> {
  const client = getDirectusAdminClient();

  const [last]: Array<{ sort?: number | null }> = await client.request(
    readItems('songs', { fields: ['sort'], sort: ['-sort'], limit: 1 }),
  );
  const sort = (last?.sort ?? 0) + 1;

  const base = buildSongSlug(sort, title);
  const siblings: Array<{ slug: string }> = await client.request(
    readItems('songs', { fields: ['slug'], filter: { slug: { _starts_with: base } }, limit: -1 }),
  );
  const slug = nextFreeSlug(base, siblings.map((row) => row.slug));

  const created: { id: number } = await client.request(
    createItem('songs', {
      ...fields,
      team: teamId,
      slug,
      sort,
      status: 'published',
    }),
  );

  console.debug(`${LOG} create: song ${created.id} (${slug}) in team ${teamId}`);
  return created.id;
}

/**
 * Правка песни (M9). Патч частичный; `slug` не пересчитывается даже при смене
 * названия — это идентичность записи, по ней upsert'ит импортёр корпуса.
 * Конфликт двух редакторов — last-write-wins (решение 1).
 *
 * Сначала проверяется, что песня принадлежит команде: `updateItem` по одному id
 * фильтра по команде не принимает. Песня другой команды — `SongNotFoundError`, как
 * несуществующая.
 */
export async function updateSong(teamId: string, id: number, input: UpdateSongInput): Promise<void> {
  requireTeamId(teamId);
  const client = getDirectusAdminClient();
  const row = toRow(input);

  const owned: Array<{ id: number }> = await client.request(
    readItems('songs', { fields: ['id'], filter: { id: { _eq: id }, team: { _eq: teamId } }, limit: 1 }),
  );
  if (owned.length === 0) {
    console.debug(`${LOG} update: song ${id} not found in team ${teamId}`);
    throw new SongNotFoundError(id);
  }

  try {
    await client.request(updateItem('songs', id, row));
  } catch (error) {
    // Песню удалили между проверкой и записью: Directus отдаёт 403/404 — это «не найдено».
    if (isNotFound(error)) throw new SongNotFoundError(id);
    throw error;
  }

  console.debug(`${LOG} update: song ${id}, fields [${Object.keys(row).join(', ')}]`);
}

/** Песня в каталоге (чужая, опубликованная, `public`); `copiedAs` — id нашей копии, если она есть. */
export type CatalogSong = {
  id: string;
  title: string;
  subtitle?: string;
  key?: string;
  teamName: string;
  copiedAs?: string;
};

type CatalogRow = SongRow & { team?: { name?: string | null } | null };

/** Каталог — опубликованные `public`-песни других команд. Своя команда в каталоге не показывается. */
function catalogFilter(teamId: string): Record<string, unknown> {
  return { status: { _eq: 'published' }, visibility: { _eq: 'public' }, team: { _neq: teamId } };
}

/**
 * Каталог публичных песен других команд с названием команды-источника, по названию.
 * `copiedAs` проставляется одним запросом по своим песням с `origin_song` — метка «уже у вас».
 * Online-only: каталог не кешируется ни здесь, ни на клиенте.
 */
export async function getCatalog(teamId: string): Promise<CatalogSong[]> {
  requireTeamId(teamId);
  const client = getDirectusAdminClient();
  const [rows, copies]: [CatalogRow[], Array<{ id: number; origin_song: number }>] = await Promise.all([
    client.request(
      readItems('songs', {
        fields: ['id', 'title', 'subtitle', 'song_key', 'team.name'],
        filter: catalogFilter(teamId),
        sort: ['title'],
        limit: -1,
      }),
    ),
    client.request(
      readItems('songs', {
        fields: ['id', 'origin_song'],
        filter: { team: { _eq: teamId }, origin_song: { _nnull: true } },
        limit: -1,
      }),
    ),
  ]);

  const copiedAs = new Map(copies.map((copy) => [copy.origin_song, String(copy.id)]));
  console.debug(`${LOG} catalog: ${rows.length} song(s), ${copies.length} already copied by team ${teamId}`);
  return rows.map((row) => ({
    id: String(row.id),
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    key: row.song_key ?? undefined,
    teamName: row.team?.name ?? '',
    copiedAs: copiedAs.get(row.id),
  }));
}

/** Песни нет в каталоге: закрытая, неопубликованная, своя и несуществующая неразличимы. */
export class CatalogSongNotFoundError extends Error {
  constructor(id: number) {
    super(`catalog song ${id} not found`);
    this.name = 'CatalogSongNotFoundError';
  }
}

/** Песня уже скопирована в команду; `existingId` — id этой копии. */
export class SongAlreadyCopiedError extends Error {
  readonly existingId: number;

  constructor(existingId: number) {
    super(`song already copied as ${existingId}`);
    this.name = 'SongAlreadyCopiedError';
    this.existingId = existingId;
  }
}

/** Колонки, которые переходят в копию. `visibility`, `team`, пометки и сеты не копируются. */
const COPIED_FIELDS = ['title', 'subtitle', 'song_key', 'default_key', 'tempo', 'time', 'content'] as const;

/**
 * Копия песни каталога в команду `teamId` — форк, а не ссылка: дальше команда правит её
 * как свою. Копия закрыта (`visibility: members`) и помнит оригинал в `origin_song`,
 * `slug`/`sort`/`status` — как у `createSong`. Повторная копия той же песни — `SongAlreadyCopiedError`.
 */
export async function copySongToTeam(teamId: string, sourceId: number): Promise<number> {
  requireTeamId(teamId);
  const client = getDirectusAdminClient();

  const [source]: SongRow[] = await client.request(
    readItems('songs', {
      fields: ['id', ...COPIED_FIELDS],
      filter: { id: { _eq: sourceId }, ...catalogFilter(teamId) },
      limit: 1,
    }),
  );
  if (!source) {
    console.debug(`${LOG} copy: song ${sourceId} is not in the catalog for team ${teamId}`);
    throw new CatalogSongNotFoundError(sourceId);
  }

  const [existing]: Array<{ id: number }> = await client.request(
    readItems('songs', {
      fields: ['id'],
      filter: { team: { _eq: teamId }, origin_song: { _eq: sourceId } },
      limit: 1,
    }),
  );
  if (existing) {
    console.debug(`${LOG} copy: song ${sourceId} already copied as ${existing.id} in team ${teamId}`);
    throw new SongAlreadyCopiedError(existing.id);
  }

  const copy: Record<string, unknown> = {};
  for (const field of COPIED_FIELDS) copy[field] = source[field];
  const id = await insertSong(teamId, source.title, { ...copy, origin_song: source.id, visibility: 'members' });
  console.debug(`${LOG} copy: song ${sourceId} -> ${id} in team ${teamId}`);
  return id;
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
