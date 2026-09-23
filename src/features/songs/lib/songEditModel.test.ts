import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chordAt,
  insertChord,
  isChordOnlyLine,
  lyricAt,
  moveChordToLine,
  moveChordWithinLine,
  neighbourTextLine,
  parseEditModel,
  removeChord,
  replaceChord,
  serializeEditModel,
  type LyricLine,
} from './songEditModel';

const CORPUS_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'songs');

const SONG = [
  '{comment: Куплет 1}',
  '[Am]Слово Тво[C]ё',
  '',
  '{comment: Проигрыш}',
  '[G][|][C/G][|]',
  '{start_of_chorus}',
  'Аллил[F]уйя',
  '{end_of_chorus}',
].join('\n');

describe('parseEditModel / serializeEditModel', () => {
  it('раскладывает строку текста на слова и аккорды с позициями', () => {
    const line = lyricAt(parseEditModel('[Am]Слово Тво[C]ё'), 0);
    expect(line).toEqual({ kind: 'lyric', text: 'Слово Твоё', chords: [{ pos: 0, chord: 'Am' }, { pos: 9, chord: 'C' }] });
  });

  it('метки секций, директивы и пустые строки не превращаются в текст', () => {
    const kinds = parseEditModel(SONG).map((l) => l.kind);
    expect(kinds).toEqual(['label', 'lyric', 'raw', 'label', 'lyric', 'raw', 'lyric', 'raw']);
  });

  it('несколько аккордов на одной позиции сохраняют порядок', () => {
    const line = lyricAt(parseEditModel('[G][|][C/G]'), 0) as LyricLine;
    expect(line.chords.map((c) => c.chord)).toEqual(['G', '|', 'C/G']);
    expect(isChordOnlyLine(line)).toBe(true);
  });

  it('незакрытая скобка остаётся текстом', () => {
    expect(serializeEditModel(parseEditModel('a [b'))).toBe('a [b');
  });

  it('весь корпус проходит туда-обратно байт в байт', () => {
    const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.chordpro'));
    expect(files.length).toBeGreaterThan(90);
    for (const file of files) {
      const content = readFileSync(join(CORPUS_DIR, file), 'utf8');
      expect(serializeEditModel(parseEditModel(content)), file).toBe(content);
    }
  });
});

describe('insertChord', () => {
  it('ставит аккорд на позицию и сохраняет порядок', () => {
    const { lines, ref } = insertChord(parseEditModel(SONG), 1, 6, 'E');
    expect(serializeEditModel(lines).split('\n')[1]).toBe('[Am]Слово [E]Тво[C]ё');
    expect(ref).toEqual({ line: 1, index: 1 });
  });

  it('на занятую позицию — заменяет аккорд', () => {
    const { lines, ref } = insertChord(parseEditModel(SONG), 1, 0, 'A');
    expect(serializeEditModel(lines).split('\n')[1]).toBe('[A]Слово Тво[C]ё');
    expect(ref).toEqual({ line: 1, index: 0 });
  });

  it('в конец строки и за её пределы — прижимается к концу', () => {
    const { lines } = insertChord(parseEditModel('Слово'), 0, 99, 'D');
    expect(serializeEditModel(lines)).toBe('Слово[D]');
  });

  it('в строку без слов — дописывает в конец цепочки', () => {
    const { lines, ref } = insertChord(parseEditModel(SONG), 4, 0, 'D');
    expect(serializeEditModel(lines).split('\n')[4]).toBe('[G][|][C/G][|][D]');
    expect(ref).toEqual({ line: 4, index: 4 });
  });

  it('не в строку текста — ошибка программиста, а не тихий no-op', () => {
    expect(() => insertChord(parseEditModel(SONG), 0, 0, 'D')).toThrow();
  });
});

describe('replaceChord / removeChord', () => {
  it('меняет и удаляет по индексу, соседи на той же позиции не страдают', () => {
    const lines = parseEditModel(SONG);
    expect(serializeEditModel(replaceChord(lines, { line: 4, index: 2 }, 'Am')).split('\n')[4]).toBe('[G][|][Am][|]');
    expect(serializeEditModel(removeChord(lines, { line: 4, index: 1 })).split('\n')[4]).toBe('[G][C/G][|]');
  });

  it('несуществующая ссылка ничего не меняет', () => {
    const lines = parseEditModel(SONG);
    expect(removeChord(lines, { line: 1, index: 9 })).toBe(lines);
    expect(replaceChord(lines, { line: 0, index: 0 }, 'X')).toBe(lines);
  });
});

describe('neighbourTextLine / moveChordToLine', () => {
  it('соседняя строка со словами пропускает метки, пустые и аккордовые строки', () => {
    const lines = parseEditModel(SONG);
    expect(neighbourTextLine(lines, 1, 1)).toBe(6);
    expect(neighbourTextLine(lines, 6, -1)).toBe(1);
    expect(neighbourTextLine(lines, 1, -1)).toBeNull();
  });

  it('переносит аккорд на ту же позицию, прижатую к длине целевой строки', () => {
    const { lines, ref } = moveChordToLine(parseEditModel(SONG), { line: 1, index: 1 }, 6);
    const out = serializeEditModel(lines).split('\n');
    expect(out[1]).toBe('[Am]Слово Твоё');
    expect(out[6]).toBe('Аллил[F]уйя[C]');
    expect(chordAt(lines, ref)).toEqual({ pos: 8, chord: 'C' });
  });
});

describe('moveChordWithinLine', () => {
  it('переставляет аккорд вдоль строки с сохранением порядка', () => {
    const { lines, ref } = moveChordWithinLine(parseEditModel('[Am]Слово Тво[C]ё'), { line: 0, index: 0 }, 10);
    expect(serializeEditModel(lines)).toBe('Слово Тво[C]ё[Am]');
    expect(ref).toEqual({ line: 0, index: 1 });
  });

  it('на позицию соседа — встаёт рядом, соседа не заменяет', () => {
    const { lines } = moveChordWithinLine(parseEditModel('[Am]Слово Тво[C]ё'), { line: 0, index: 0 }, 9);
    expect(serializeEditModel(lines)).toBe('Слово Тво[C][Am]ё');
  });
});
