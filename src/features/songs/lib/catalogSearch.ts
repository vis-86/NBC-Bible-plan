import type { CatalogSong } from '../types';
import { normalizeForSearch, toSearchTokens } from './searchText';

/** Поиск по названию и подзаголовку: каждое слово запроса должно входить в одно из них. */
export function filterCatalog(songs: CatalogSong[], query: string): CatalogSong[] {
  const tokens = toSearchTokens(query);
  if (tokens.length === 0) return songs;
  return songs.filter((song) => {
    const haystack = normalizeForSearch(`${song.title} ${song.subtitle ?? ''}`);
    return tokens.every((t) => haystack.includes(t));
  });
}
