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

/** Инструменты рукописных пометок (M10, §6). */
export type SongInkTool = 'pen' | 'highlighter' | 'arrow' | 'text';

/**
 * Одна рукописная пометка поверх листа песни.
 *
 * Геометрия привязана к СТРОКЕ, а не к странице: при смене размера шрифта или числа
 * колонок штрих едет вместе со своей строкой. Осознанные ограничения этой модели
 * (штрих не масштабируется вместе с текстом; индексы ломаются при правке песни)
 * описаны в `docs/song-viewer-spec.md` §6.
 */
export interface SongStroke {
  /** Стабильный id — нужен undo/ластику/перетаскиванию заметок. */
  id: string;
  /** `arrow` — прямой отрезок с наконечником: ровно две точки (начало, остриё). */
  tool: SongInkTool;
  /** Якорь: индексы секции и строки в распарсенной песне (§6). */
  anchor: { section: number; line: number };
  /** px относительно bounding box строки-якоря. Для `text` — одна точка. */
  points: Array<[x: number, y: number, pressure: number]>;
  color: string;
  width: number;
  /** Только для `tool === 'text'`. */
  text?: string;
  /** Только для `tool === 'text'`: пометка на поле вдоль колонки (`writing-mode: vertical-rl`). */
  vertical?: boolean;
}

/** Личные пометки к одной песне. */
export interface SongAnnotations {
  strokes: SongStroke[];
  /** LWW-метка (ms): побеждает запись с большим значением. */
  updatedAt: number;
}

/** Ответ `GET /api/songs/:id/state`. */
export interface SongStateResponse {
  annotations: SongAnnotations;
}
