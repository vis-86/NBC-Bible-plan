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
