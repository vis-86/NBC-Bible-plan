import { importChordsOverLyrics, type ChordNotation, type ImportedSong } from './importChordsOverLyrics';
import { splitKey } from './songKey';
import type { CreateSongPayload, Song, SongVisibility, UpdateSongPayload } from '../types';

/**
 * Черновик редактора песни (M9, T3a) — сырые значения полей формы, как их ввёл человек.
 * Нормализация и валидация — только здесь, чтобы форма, кнопка «Сохранить» и патч
 * одинаково понимали «что изменилось» и «что можно отправить».
 */
export interface SongEditorDraft {
  title: string;
  key: string;
  tempo: string;
  time: string;
  /** ChordPro — единственный источник истины текста; «Вставить» и «Исходник» пишут сюда. */
  content: string;
  /** Кому открыта песня по ссылке «Поделиться». */
  visibility: SongVisibility;
}

export type SongEditorErrors = Partial<Record<keyof SongEditorDraft, string>>;

export const EMPTY_SONG_DRAFT: SongEditorDraft = {
  title: '',
  key: '',
  tempo: '',
  time: '',
  content: '',
  // Публикация в общий каталог — осознанное действие, по умолчанию песня видна только команде.
  visibility: 'members',
};

/** Лимиты зеркалят `src/lib/validators/songs.schemas.ts` — BFF всё равно проверит сам. */
const TITLE_MAX = 200;
const KEY_MAX = 16;
const TIME_MAX = 16;
const CONTENT_MAX = 50_000;
const TEMPO_MIN = 20;
const TEMPO_MAX = 400;

/**
 * Кириллические двойники латинских нот. Реальный дефект корпуса — `С#m` с русской «С»:
 * выглядит правильно, а транспозиция молча не работает.
 */
const CYRILLIC_LOOKALIKES: Record<string, string> = { А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H' };

/**
 * Тональность к виду, который понимает `songKey.ts`: латиница, `H` → `B`. Русское `H`
 * однозначно значит си; `B` оставляем как есть — в поле тональности его пишут
 * по-английски, а угадывать русскую нотацию по одной букве нельзя.
 */
export function normalizeSongKey(raw: string): string {
  const latin = raw.trim().replace(/[АВСЕН]/g, (ch) => CYRILLIC_LOOKALIKES[ch]);
  return latin.replace(/^H/, 'B');
}

/** Переводы строк к `\n` и без хвостовых пустых строк — иначе «ничего не менял» ≠ исходнику. */
export function normalizeSongContent(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trimEnd();
}

export function draftFromSong(song: Song): SongEditorDraft {
  return {
    title: song.title,
    key: song.key ?? '',
    tempo: song.tempo ?? '',
    time: song.time ?? '',
    content: song.content,
    visibility: song.visibility ?? 'public',
  };
}

export function validateSongDraft(draft: SongEditorDraft): SongEditorErrors {
  const errors: SongEditorErrors = {};

  const title = draft.title.trim();
  if (!title) errors.title = 'Введите название';
  else if (title.length > TITLE_MAX) errors.title = `Название: максимум ${TITLE_MAX} символов`;

  const key = normalizeSongKey(draft.key);
  if (key && (key.length > KEY_MAX || !splitKey(key))) {
    errors.key = 'Тональность латиницей: A, F#m, Bb';
  }

  const tempo = draft.tempo.trim();
  if (tempo) {
    const value = Number(tempo);
    if (!/^\d+$/.test(tempo) || value < TEMPO_MIN || value > TEMPO_MAX) {
      errors.tempo = `Темп — число от ${TEMPO_MIN} до ${TEMPO_MAX}`;
    }
  }

  if (draft.time.trim().length > TIME_MAX) errors.time = `Размер: максимум ${TIME_MAX} символов`;

  const content = normalizeSongContent(draft.content);
  if (!content.trim()) errors.content = 'Добавьте текст песни';
  else if (content.length > CONTENT_MAX) errors.content = 'Текст песни слишком длинный';

  return errors;
}

export function hasSongDraftErrors(errors: SongEditorErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Поля черновика в виде тела запроса. Вызывать только для черновика без ошибок. */
export function toCreateSongPayload(draft: SongEditorDraft): CreateSongPayload {
  const key = normalizeSongKey(draft.key);
  const tempo = draft.tempo.trim();
  const time = draft.time.trim();
  return {
    title: draft.title.trim(),
    songKey: key || null,
    tempo: tempo ? Number(tempo) : null,
    time: time || null,
    content: normalizeSongContent(draft.content),
    visibility: draft.visibility,
  };
}

/**
 * Только изменившиеся поля. `null` — менять нечего: пустой PUT BFF отвергает, а без
 * этой проверки лишнее сохранение подняло бы `date_updated`, и дельта-синк разослал бы
 * песню всем устройствам без единого изменения.
 */
export function toUpdateSongPayload(original: SongEditorDraft, draft: SongEditorDraft): UpdateSongPayload | null {
  const before = toCreateSongPayload(original);
  const after = toCreateSongPayload(draft);
  const patch: UpdateSongPayload = {};
  (Object.keys(after) as Array<keyof CreateSongPayload>).forEach((field) => {
    if (after[field] !== before[field]) Object.assign(patch, { [field]: after[field] });
  });
  return Object.keys(patch).length > 0 ? patch : null;
}

export type PasteNotation = 'auto' | ChordNotation;

export interface PasteState {
  /** Что вставлено в поле «Вставить» — как есть, до разбора. */
  raw: string;
  notation: PasteNotation;
  /** Название взято из первой строки вставки, а не введено человеком. */
  titleIsAuto: boolean;
  /** Текст песни до начала вставки — возвращается, если поле вставки очистили. */
  baseContent: string;
}

export interface PasteResult {
  draft: SongEditorDraft;
  paste: PasteState;
  imported: ImportedSong | null;
}

/**
 * Разбор вставки «аккорды над строкой» в черновик. Вставка заменяет текст целиком;
 * очищенное поле возвращает текст, который был до вставки (у существующей песни это
 * её текст, а не пустой лист).
 *
 * Название подставляется из первой строки, только пока человек его не трогал: пустое
 * или ранее подставленное — перезаписываем, введённое руками — нет.
 */
export function applyPastedText(draft: SongEditorDraft, paste: PasteState, raw: string): PasteResult {
  const wasEmpty = !paste.raw.trim();
  const baseContent = wasEmpty ? draft.content : paste.baseContent;

  if (!raw.trim()) {
    const title = paste.titleIsAuto ? '' : draft.title;
    return {
      draft: { ...draft, title, content: baseContent },
      paste: { ...paste, raw, titleIsAuto: false, baseContent },
      imported: null,
    };
  }

  const imported = importChordsOverLyrics(raw, paste.notation === 'auto' ? {} : { notation: paste.notation });
  const canFillTitle = paste.titleIsAuto || !draft.title.trim();
  const title = canFillTitle ? (imported.title ?? '') : draft.title;

  return {
    draft: { ...draft, title, content: imported.chordPro },
    paste: { ...paste, raw, titleIsAuto: canFillTitle && imported.title !== undefined, baseContent },
    imported,
  };
}
