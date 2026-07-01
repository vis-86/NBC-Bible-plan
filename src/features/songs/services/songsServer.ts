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
import type { Song, SongSummary } from '../types';

const LOG = '[Songs API]';

type SongRow = {
  id: number;
  title: string;
  subtitle?: string | null;
  song_key?: string | null;
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
    content: row.content ?? '',
  };
}

/** Список песен (краткие карточки) для страницы каталога и клиентского поиска. */
export async function getSongsList(): Promise<SongSummary[]> {
  const client = getDirectusAdminClient();
  const rows: SongRow[] = await client.request(
    readItems('songs', {
      fields: ['id', 'title', 'subtitle', 'song_key'],
      filter: { status: { _eq: 'published' } },
      sort: ['sort', 'title'],
      limit: -1,
    }),
  );
  console.debug(`${LOG} list: ${rows.length} song(s)`);
  return rows.map(toSummary);
}

/** Одна песня с полным ChordPro-контентом, либо null если не найдена. */
export async function getSongById(id: number): Promise<Song | null> {
  const client = getDirectusAdminClient();
  try {
    const row: SongRow = await client.request(
      readItem('songs', id, { fields: ['id', 'title', 'subtitle', 'song_key', 'tempo', 'time', 'content'] }),
    );
    return row ? toSong(row) : null;
  } catch (error) {
    // Directus кидает 403/404 для отсутствующего id — трактуем как "не найдено".
    console.debug(`${LOG} detail: song ${id} not found`, error instanceof Error ? error.message : error);
    return null;
  }
}
