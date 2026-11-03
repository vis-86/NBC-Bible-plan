import { describe, expect, it } from 'vitest';
import {
  EMPTY_SONG_DRAFT,
  draftFromSong,
  hasSongDraftErrors,
  normalizeSongContent,
  normalizeSongKey,
  toCreateSongPayload,
  toUpdateSongPayload,
  validateSongDraft,
  applyPastedText,
  type PasteState,
  type SongEditorDraft,
} from './songEditorDraft';

const valid: SongEditorDraft = {
  title: '  Велик Господь ',
  key: 'Am',
  tempo: '72',
  time: '4/4',
  content: '{comment: Куплет}\n[Am]Слово\r\n',
  visibility: 'public',
};

describe('normalizeSongKey', () => {
  it('переводит кириллических двойников в латиницу', () => {
    expect(normalizeSongKey('С#m')).toBe('C#m');
    expect(normalizeSongKey('Е')).toBe('E');
  });

  it('русское H → B, английское B не трогает', () => {
    expect(normalizeSongKey('Hm')).toBe('Bm');
    expect(normalizeSongKey('Bb')).toBe('Bb');
  });

  it('срезает пробелы', () => {
    expect(normalizeSongKey('  G ')).toBe('G');
  });
});

describe('normalizeSongContent', () => {
  it('приводит переводы строк и срезает хвост', () => {
    expect(normalizeSongContent('a\r\nb\rc\n\n  ')).toBe('a\nb\nc');
  });
});

describe('validateSongDraft', () => {
  it('корректный черновик без ошибок', () => {
    expect(hasSongDraftErrors(validateSongDraft(valid))).toBe(false);
  });

  it('пустой черновик: нужны название и текст, прочее необязательно', () => {
    const errors = validateSongDraft(EMPTY_SONG_DRAFT);
    expect(Object.keys(errors).sort()).toEqual(['content', 'title']);
  });

  it('текст из одних пробелов — ошибка', () => {
    expect(validateSongDraft({ ...valid, content: '  \n\n ' }).content).toBeDefined();
  });

  it('нераспознанная тональность — ошибка, кириллическая «А» — нет', () => {
    expect(validateSongDraft({ ...valid, key: 'Ля' }).key).toBeDefined();
    expect(validateSongDraft({ ...valid, key: 'Аm' }).key).toBeUndefined();
  });

  it.each(['abc', '19', '401', '72.5', '-80'])('темп %s — ошибка', (tempo) => {
    expect(validateSongDraft({ ...valid, tempo }).tempo).toBeDefined();
  });

  it('размер с пояснением из корпуса допустим', () => {
    expect(validateSongDraft({ ...valid, time: '4/4 (6/8)' }).time).toBeUndefined();
  });

  it('слишком длинное название — ошибка', () => {
    expect(validateSongDraft({ ...valid, title: 'а'.repeat(201) }).title).toBeDefined();
  });
});

describe('toCreateSongPayload', () => {
  it('нормализует поля, пустые необязательные → null', () => {
    expect(toCreateSongPayload({ ...valid, key: 'Hm', time: ' ' , tempo: '' })).toEqual({
      title: 'Велик Господь',
      songKey: 'Bm',
      tempo: null,
      time: null,
      content: '{comment: Куплет}\n[Am]Слово',
      visibility: 'public',
    });
  });
});

describe('toUpdateSongPayload', () => {
  const song = {
    id: '7',
    title: 'Велик Господь',
    key: 'Am',
    tempo: '72',
    time: '4/4',
    content: '{comment: Куплет}\n[Am]Слово\n',
  };

  it('без изменений → null (даже если отличаются только хвостовые переводы строк)', () => {
    const original = draftFromSong(song);
    expect(toUpdateSongPayload(original, { ...original, content: song.content.trimEnd() + '\r\n\n' })).toBeNull();
  });

  it('в патч попадают только изменённые поля', () => {
    const original = draftFromSong(song);
    expect(toUpdateSongPayload(original, { ...original, tempo: '80', content: '[Am]Другое' })).toEqual({
      tempo: 80,
      content: '[Am]Другое',
    });
  });

  it('очищенное необязательное поле уходит как null', () => {
    const original = draftFromSong(song);
    expect(toUpdateSongPayload(original, { ...original, key: '' })).toEqual({ songKey: null });
  });

  it('песня без visibility (кеш до появления поля) читается как public', () => {
    expect(draftFromSong(song).visibility).toBe('public');
  });

  it('смена видимости уходит в патч одна', () => {
    const original = draftFromSong(song);
    expect(toUpdateSongPayload(original, { ...original, visibility: 'members' })).toEqual({ visibility: 'members' });
  });
});

describe('applyPastedText', () => {
  const PASTED = ['Велик Господь', '', 'Куплет 1:', 'Am        C', 'Слово Твоё'].join('\n');
  const freshPaste: PasteState = { raw: '', notation: 'auto', titleIsAuto: false, baseContent: '' };

  it('разбирает вставку в ChordPro и берёт название из первой строки', () => {
    const { draft, paste, imported } = applyPastedText(EMPTY_SONG_DRAFT, freshPaste, PASTED);
    expect(draft.title).toBe('Велик Господь');
    expect(draft.content).toContain('[Am]');
    expect(draft.content).not.toContain('Велик Господь');
    expect(paste.titleIsAuto).toBe(true);
    expect(imported?.notation).toBe('en');
  });

  it('введённое руками название не перезаписывает', () => {
    const { draft, paste } = applyPastedText({ ...EMPTY_SONG_DRAFT, title: 'Моё' }, freshPaste, PASTED);
    expect(draft.title).toBe('Моё');
    expect(paste.titleIsAuto).toBe(false);
  });

  it('подставленное название обновляется при следующей правке вставки', () => {
    const first = applyPastedText(EMPTY_SONG_DRAFT, freshPaste, 'Вел\n\nAm\nСлово');
    const second = applyPastedText(first.draft, first.paste, PASTED);
    expect(second.draft.title).toBe('Велик Господь');
  });

  it('очищенная вставка возвращает текст песни и снимает подставленное название', () => {
    const song = { ...EMPTY_SONG_DRAFT, content: '[G]Было' };
    const pasted = applyPastedText(song, freshPaste, PASTED);
    const cleared = applyPastedText(pasted.draft, pasted.paste, '');
    expect(cleared.draft.content).toBe('[G]Было');
    expect(cleared.draft.title).toBe('');
    expect(cleared.imported).toBeNull();
  });

  it('явная нотация: H в русской — си (B)', () => {
    const paste: PasteState = { ...freshPaste, notation: 'ru' };
    const { draft } = applyPastedText({ ...EMPTY_SONG_DRAFT, title: 'x' }, paste, 'Hm        E\nСлово Твоё');
    expect(draft.content).toContain('[Bm]');
  });
});

describe('visibility по умолчанию', () => {
  it('новая песня — только для команды', () => {
    expect(EMPTY_SONG_DRAFT.visibility).toBe('members');
  });
  it('существующая песня сохраняет public', () => {
    expect(draftFromSong({ id: '1', title: 'T', content: 'x', visibility: 'public' }).visibility).toBe('public');
  });
});
