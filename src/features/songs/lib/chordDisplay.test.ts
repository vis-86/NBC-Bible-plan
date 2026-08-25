import { describe, expect, it } from 'vitest';
import { applyChordDisplay } from './chordDisplay';

describe('applyChordDisplay', () => {
  it('full возвращает исходную строку без изменений', () => {
    const line = 'Сла[G/B]ва [Am7]Ему';
    expect(applyChordDisplay(line, 'full')).toBe(line);
  });

  describe('noBass', () => {
    it.each([
      ['[G]', '[G]'],
      ['[Am]', '[Am]'],
      ['[Cmaj7]', '[Cmaj7]'],
      ['[G/B]', '[G]'],
      ['[Am7/G]', '[Am7]'],
    ])('%s → %s', (input, expected) => {
      expect(applyChordDisplay(input, 'noBass')).toBe(expected);
    });

    it('цепочка сворачивается поэлементно', () => {
      expect(applyChordDisplay('[E-B/D#-E/D]', 'noBass')).toBe('[E-B-E]');
    });
  });

  describe('bassOnly', () => {
    it.each([
      ['[G]', '[G]'],
      ['[Am]', '[A]'],
      ['[Cmaj7]', '[C]'],
      ['[G/B]', '[B]'],
      ['[Am7/G]', '[G]'],
      ['[F#m7/C#]', '[C#]'],
      ['[Bb/D]', '[D]'],
    ])('%s → %s', (input, expected) => {
      expect(applyChordDisplay(input, 'bassOnly')).toBe(expected);
    });

    it('цепочка сворачивается поэлементно', () => {
      expect(applyChordDisplay('[E-B/D#-E/D]', 'bassOnly')).toBe('[E-D#-D]');
    });
  });

  it.each(['noBass', 'bassOnly'] as const)('%s: bar и текстовые пометки проходят насквозь', (display) => {
    expect(applyChordDisplay('[|] [(пауза)] [(capella)]', display)).toBe('[|] [(пауза)] [(capella)]');
  });

  it.each(['noBass', 'bassOnly'] as const)('%s: нераспознанный аккорд остаётся дословно', (display) => {
    expect(applyChordDisplay('[C#mсть.]', display)).toBe('[C#mсть.]');
  });

  it.each(['noBass', 'bassOnly'] as const)('%s: неизменившийся маркер отдаётся дословно, с пробелами внутри', (display) => {
    expect(applyChordDisplay('[ G ]', display)).toBe('[ G ]');
  });

  it('лирика не трогается', () => {
    expect(applyChordDisplay('Сла[G/B]ва Тебе', 'bassOnly')).toBe('Сла[B]ва Тебе');
  });
});
