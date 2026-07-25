import { describe, expect, it } from 'vitest';
import { parseKey, transposeChord, transposeLine } from './transpose';

describe('parseKey', () => {
  it('разбирает мажор и минор', () => {
    expect(parseKey('G')).toEqual({ tonic: 'G', minor: false });
    expect(parseKey('Ab')).toEqual({ tonic: 'Ab', minor: false });
    expect(parseKey('Em')).toEqual({ tonic: 'E', minor: true });
    expect(parseKey('F#m')).toEqual({ tonic: 'F#', minor: true });
  });

  it('нераспознанное и пустое → null', () => {
    expect(parseKey('Zz')).toBeNull();
    expect(parseKey('')).toBeNull();
    expect(parseKey(undefined)).toBeNull();
  });
});

describe('transposeChord', () => {
  it('semitones === 0 — identity', () => {
    expect(transposeChord('C/G', 0, 'C')).toBe('C/G');
    expect(transposeChord('C#mсть.', 0, 'C')).toBe('C#mсть.');
  });

  it('транспонирует простые аккорды и сохраняет суффикс дословно', () => {
    expect(transposeChord('G', 2, 'A')).toBe('A');
    expect(transposeChord('Bm7', 2, 'D')).toBe('C#m7');
    expect(transposeChord('Gsus', 2, 'A')).toBe('Asus');
    expect(transposeChord('F#sus4', 1, 'G')).toBe('Gsus4');
  });

  it('бас после / транспонируется отдельно', () => {
    expect(transposeChord('C/G', 2, 'D')).toBe('D/A');
    expect(transposeChord('B/D#', 1, 'C')).toBe('C/E');
  });

  it('цепочка через дефис — каждый элемент отдельно', () => {
    expect(transposeChord('E-B/D#-E/D', 1, 'F')).toBe('F-C/E-F/Eb');
  });

  it('битые данные возвращаются без изменений', () => {
    expect(transposeChord('C#mсть.', 3, 'Eb')).toBe('C#mсть.');
    expect(transposeChord('H', 2, 'D')).toBe('H');
    expect(transposeChord('', 2, 'D')).toBe('');
  });

  it('спеллинг берётся из целевой тональности, а не из направления сдвига', () => {
    // Eb-мажор — бемоли.
    expect(transposeChord('C', 3, 'Eb')).toBe('Eb');
    expect(transposeChord('F', 3, 'Eb')).toBe('Ab');
    expect(transposeChord('G', 3, 'Eb')).toBe('Bb');
    // D-мажор — диезы.
    expect(transposeChord('E', 2, 'D')).toBe('F#');
    expect(transposeChord('B', 2, 'D')).toBe('C#');
  });

  it('лад целевой тональности влияет на спеллинг (Cm — бемоли)', () => {
    expect(transposeChord('A', 3, 'Cm')).toBe('C');
    expect(transposeChord('F', 3, 'Cm')).toBe('Ab');
  });

  it('нераспознанная целевая тональность не ломает транспозицию (дефолт — диезы)', () => {
    expect(transposeChord('C', 1, 'Zz')).toBe('C#');
  });

  it('+12 полутонов возвращает исходную высоту', () => {
    expect(transposeChord('F#sus4', 12, 'F#')).toBe('F#sus4');
    expect(transposeChord('C/G', 12, 'C')).toBe('C/G');
  });
});

describe('transposeLine', () => {
  it('semitones === 0 возвращает исходную строку', () => {
    const line = 'М[G]уж скорбей” так н[C]азван Т[D]от,';
    expect(transposeLine(line, 0, 'C')).toBe(line);
  });

  it('транспонирует аккорды внутри слова, лирику не трогает', () => {
    expect(transposeLine('М[G]уж скорбей так н[C]азван Т[D]от,', 2, 'A')).toBe('М[A]уж скорбей так н[D]азван Т[E]от,');
  });

  it('такты и текстовые пометки проходят насквозь', () => {
    expect(transposeLine('[G][|][C/G][|]', 2, 'A')).toBe('[A][|][D/A][|]');
    expect(transposeLine('[(пауза)] [Am]', 2, 'B')).toBe('[(пауза)] [Bm]');
  });

  it('битый токен в строке не мешает остальным', () => {
    expect(transposeLine('[C#mсть.] [G]', 2, 'A')).toBe('[C#mсть.] [A]');
  });

  it('строка без маркеров возвращается как есть', () => {
    expect(transposeLine('только текст без аккордов', 5, 'F')).toBe('только текст без аккордов');
  });
});
