import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { parseSongBlocks } from './songParser';
import { parseLine } from './lineParser';
import { parseChordProFile, chordProToSong } from './chordProParser';

const SAMPLE = readFileSync(join(__dirname, '__fixtures__', 'sample.chordpro'), 'utf-8');

describe('parseChordProFile', () => {
  it('extracts metadata and strips it from content', () => {
    const parsed = parseChordProFile(SAMPLE, '42-testovaya.chordpro');
    expect(parsed.id).toBe('42');
    expect(parsed.metadata.title).toBe('Тестовая песня');
    expect(parsed.metadata.subtitle).toBe('Группа прославления');
    expect(parsed.metadata.key).toBe('D');
    expect(parsed.metadata.tempo).toBe('72');
    // Метадирективы из шапки не должны попадать в content.
    expect(parsed.content).not.toContain('{title:');
    expect(parsed.content).toContain('{start_of_chorus}');
  });

  it('maps parsed chordpro to a Song', () => {
    const song = chordProToSong(parseChordProFile(SAMPLE, '42-testovaya.chordpro'));
    expect(song).toMatchObject({ id: '42', title: 'Тестовая песня', subtitle: 'Группа прославления', key: 'D' });
    expect(song.content.length).toBeGreaterThan(0);
  });
});

describe('parseSongBlocks', () => {
  const blocks = parseSongBlocks(parseChordProFile(SAMPLE, '42-x.chordpro').content);

  it('splits content into comment-delimited blocks', () => {
    // Куплет 1 (+ chorus содержимое) / Куплет 2.
    const comments = blocks.map((b) => b.comment);
    expect(comments).toContain('Куплет 1');
    expect(comments).toContain('Куплет 2');
  });

  it('keeps chord markup inside block content', () => {
    const verse1 = blocks.find((b) => b.comment === 'Куплет 1');
    expect(verse1?.content).toContain('[D]');
  });

  it('drops chorus/metadata directives from block content', () => {
    const joined = blocks.map((b) => b.content).join('\n');
    expect(joined).not.toContain('{start_of_chorus}');
    expect(joined).not.toContain('{end_of_chorus}');
    expect(joined).not.toContain('{key:');
  });

  it('keeps a song without any section label as one unlabelled block', () => {
    // M9: музыкант вставит короткую песню без «Куплет:» — лист не должен выйти пустым.
    expect(parseSongBlocks('[G]Слава [D]Богу\nАллилуйя\n')).toEqual([
      { comment: '', content: '[G]Слава [D]Богу\nАллилуйя', commentType: 'normal', kind: 'other' },
    ]);
  });

  it('keeps text before the first label as a leading unlabelled block', () => {
    const parsed = parseSongBlocks('\n{title: X}\nВступление [Am]\n\n{comment: Припев}\nАллилуйя');
    expect(parsed.map(({ comment, content, kind }) => ({ comment, content, kind }))).toEqual([
      { comment: '', content: 'Вступление [Am]', kind: 'other' },
      { comment: 'Припев', content: 'Аллилуйя', kind: 'chorus' },
    ]);
  });

  it('does not add a leading block when only blanks and directives precede the first label', () => {
    // Так начинаются все песни каталога: индексы секций (якоря пометок) не сдвигаются.
    const parsed = parseSongBlocks('\n{key: D}\n{start_of_chorus}\n\n{comment: Куплет 1}\nтекст');
    expect(parsed.map((b) => b.comment)).toEqual(['Куплет 1']);
  });

  it('returns no blocks for empty content', () => {
    expect(parseSongBlocks('')).toEqual([]);
    expect(parseSongBlocks('\n  \n{title: X}\n')).toEqual([]);
  });
});

describe('parseLine', () => {
  it('tokenizes chords and text', () => {
    const { tokens, isChordsOnly } = parseLine('Го[D]во[E]ри');
    expect(tokens).toEqual([
      { type: 'text', value: 'Го' },
      { type: 'chord', value: 'D' },
      { type: 'text', value: 'во' },
      { type: 'chord', value: 'E' },
      { type: 'text', value: 'ри' },
    ]);
    expect(isChordsOnly).toBe(false);
  });

  it('flags chords-only lines', () => {
    const { isChordsOnly } = parseLine('[D] [G] [A]');
    expect(isChordsOnly).toBe(true);
  });

  it('does not flag an empty line as chords-only', () => {
    expect(parseLine('').isChordsOnly).toBe(false);
  });
});
