// @ts-nocheck - Directus SDK typing issue with custom schema (см. src/lib/directus-data.ts):
// коллекции в DirectusSchema типизированы объектами (не массивами), из-за чего SDK v20
// сужает collection-параметр readItems/readItem до never. Экспортируемые функции при этом
// типизированы для потребителей (роутов) — проверка отключена только внутри файла.
/**
 * Серверный доступ к коллекции `songs` через admin-клиент Directus.
 * Маппит поле `song_key` (Directus) → `key` (доменный тип Song).
 * Клиент в Directus напрямую не ходит — только через эти функции + API-роуты (arch: proxy).
 */
import { readItem, readItems } from '@directus/sdk';
import { getDirectusAdminClient } from '@/lib/directus';
import { chordProToPlainText } from '../lib/searchText';
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
};

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
      readItem('songs', id, { fields: ['id', 'title', 'subtitle', 'song_key', 'default_key', 'tempo', 'time', 'content'] }),
    );
    return row ? toSong(row) : null;
  } catch (error) {
    // Directus кидает 403/404 для отсутствующего id — трактуем как "не найдено".
    console.debug(`${LOG} detail: song ${id} not found`, error instanceof Error ? error.message : error);
    return null;
  }
}
