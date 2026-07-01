/**
 * Доменные типы фичи «Песни».
 *
 * `Song` — нормализованная песня после парсинга ChordPro. `content` хранит сырой
 * ChordPro (как он лежит в Directus-коллекции `songs`); метаданные (title/subtitle/
 * key/tempo/time) вынесены наружу для списка и поиска.
 */
export interface Song {
  /** Числовой id (из имени файла `123-...chordpro` → `"123"`), = ключ в Directus. */
  id: string;
  title: string;
  subtitle?: string;
  /** Тональность (директива {key}). */
  key?: string;
  tempo?: string;
  time?: string;
  /** Сырой ChordPro-контент без метадиректив в шапке. */
  content: string;
}

/** Краткая карточка песни для списка/поиска (без тяжёлого `content`). */
export type SongSummary = Omit<Song, 'content'>;
