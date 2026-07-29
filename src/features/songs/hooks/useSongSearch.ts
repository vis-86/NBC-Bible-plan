'use client';

import { useMemo } from 'react';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { SongSummary } from '../types';
import { normalizeForSearch, toSearchTokens } from '../lib/searchText';

/**
 * Где найдено совпадение. Уровень названия всегда выше уровня текста в выдаче —
 * это ключевое требование: «сначала ищем по названию, потом по тексту песен».
 */
export interface SongSearchHit {
  song: SongSummary;
  match: 'title' | 'text';
  /** Кусок текста песни вокруг совпадения (только для `match: 'text'`). */
  snippet?: string;
}

/** Песня с преднормализованными полями — Fuse индексирует их, а не сырой `title`. */
interface IndexedSong {
  song: SongSummary;
  titleNorm: string;
  subtitleNorm: string;
  /** Нормализованный текст песни; пустой, если у песни нет `plainText` (старый кэш). */
  textNorm: string;
}

const FUSE_OPTIONS: IFuseOptions<IndexedSong> = {
  keys: ['titleNorm', 'subtitleNorm'],
  threshold: 0.4,
  ignoreLocation: true,
};

const SNIPPET_RADIUS = 30;

/** Строит нормализованный индекс один раз на список песен. */
function buildIndex(songs: SongSummary[]): { indexed: IndexedSong[]; fuse: Fuse<IndexedSong> } {
  const indexed = songs.map<IndexedSong>((song) => ({
    song,
    titleNorm: normalizeForSearch(song.title),
    subtitleNorm: normalizeForSearch(song.subtitle ?? ''),
    textNorm: normalizeForSearch(song.plainText ?? ''),
  }));
  return { indexed, fuse: new Fuse(indexed, FUSE_OPTIONS) };
}

/**
 * Вырезает кусок исходного (ненормализованного) текста вокруг первого совпадения
 * первого токена. Позицию ищем регистронезависимо прямо в `plainText`; если токен
 * (после снятия диакритики/пунктуации) в сыром тексте не находится — сниппет не отдаём.
 */
function buildSnippet(plainText: string, firstToken: string): string | undefined {
  if (!plainText || !firstToken) return undefined;

  const flat = plainText.replace(/\s+/g, ' ');
  const pos = flat.toLowerCase().indexOf(firstToken);
  if (pos === -1) return undefined;

  const start = Math.max(0, pos - SNIPPET_RADIUS);
  const end = Math.min(flat.length, pos + firstToken.length + SNIPPET_RADIUS);
  const core = flat.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${core}${end < flat.length ? '…' : ''}`;
}

/**
 * Ранжирование в три уровня, порядок уровней = порядок выдачи:
 *   0. точное/префиксное совпадение нормализованного названия;
 *   1. нечёткое совпадение названия/подзаголовка (Fuse);
 *   2. все токены запроса входят подстроками в текст песни (AND).
 * Дубли между уровнями убираются по id песни.
 */
function rank(
  indexed: IndexedSong[],
  fuse: Fuse<IndexedSong>,
  query: string
): SongSearchHit[] {
  const q = normalizeForSearch(query);
  if (!q) return indexed.map((it) => ({ song: it.song, match: 'title' as const }));

  const tokens = toSearchTokens(query);
  const seen = new Set<string>();
  const hits: SongSearchHit[] = [];

  const pushTitle = (it: IndexedSong) => {
    if (seen.has(it.song.id)) return;
    seen.add(it.song.id);
    hits.push({ song: it.song, match: 'title' });
  };

  // Уровень 0 — точное/префиксное совпадение названия, в исходном порядке каталога.
  for (const it of indexed) {
    if (it.titleNorm === q || it.titleNorm.startsWith(q)) pushTitle(it);
  }

  // Уровень 1 — нечёткое совпадение названия/подзаголовка.
  for (const { item } of fuse.search(q)) pushTitle(item);

  // Уровень 2 — все токены входят в текст песни (AND). Только среди ещё не найденных.
  for (const it of indexed) {
    if (seen.has(it.song.id) || !it.textNorm) continue;
    if (tokens.every((t) => it.textNorm.includes(t))) {
      seen.add(it.song.id);
      hits.push({ song: it.song, match: 'text', snippet: buildSnippet(it.song.plainText ?? '', tokens[0]) });
    }
  }

  return hits;
}

/** Чистая функция поиска (для тестов и хука). Пустой запрос → весь список как `title`. */
export function searchSongs(songs: SongSummary[], query: string): SongSearchHit[] {
  const { indexed, fuse } = buildIndex(songs);
  return rank(indexed, fuse, query);
}

/** Хук: мемоизирует нормализованный индекс по songs, пересчитывает выдачу по query. */
export function useSongSearch(songs: SongSummary[], query: string): SongSearchHit[] {
  const { indexed, fuse } = useMemo(() => buildIndex(songs), [songs]);

  return useMemo(() => {
    const hits = rank(indexed, fuse, query);
    if (process.env.NODE_ENV !== 'production') {
      const titleN = hits.filter((h) => h.match === 'title').length;
      const textN = hits.length - titleN;
      console.debug(
        `[useSongSearch] query="${query.trim()}" → ${hits.length} (title: ${titleN}, text: ${textN}) из ${songs.length}`
      );
    }
    return hits;
  }, [indexed, fuse, query, songs.length]);
}
