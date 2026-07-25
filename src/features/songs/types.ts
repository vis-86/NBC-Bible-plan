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
  /**
   * ИСХОДНАЯ тональность (`songs.song_key`) — в ней записаны аккорды в `content`.
   * Меняется только вместе с текстом песни. Уровень 1 из трёх (§10.1 спеки).
   */
  key?: string;
  /**
   * ОСНОВНАЯ тональность (`songs.default_key`) — в ней команда обычно играет.
   * Пусто ⇒ действует `key`. Приходит только в детали песни, в списке не запрашивается.
   * Уровень 2 из трёх; уровень 3 (рабочая тональность музыканта) в домене песни не живёт —
   * см. `lib/personalKeyStore.ts`.
   */
  defaultKey?: string;
  tempo?: string;
  time?: string;
  /** Сырой ChordPro-контент без метадиректив в шапке. */
  content: string;
}

/**
 * Краткая карточка песни для списка/поиска (без тяжёлого `content`).
 * `defaultKey` здесь отсутствует по типу: списку тональность не нужна, и лишние поля
 * утяжеляют `songs:list`, который целиком уходит в офлайн-кэш.
 */
export type SongSummary = Omit<Song, 'content' | 'defaultKey'>;

/** Ответ `GET /api/songs` — список кратких карточек. */
export interface SongListResponse {
  songs: SongSummary[];
}

/** Ответ `GET /api/songs/[id]` — одна песня с полным контентом. */
export interface SongResponse {
  song: Song;
}
