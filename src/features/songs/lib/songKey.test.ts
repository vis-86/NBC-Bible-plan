import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyByOffset, keyFromParts, keyOptions, resetSongKeyWarnings, resolveEffectiveKey, semitonesBetween, splitKey } from './songKey';

describe('resolveEffectiveKey', () => {
  it('личная тональность перебивает всё', () => {
    expect(resolveEffectiveKey({ personalKey: 'Ab', setlistKey: 'A', defaultKey: 'G', originalKey: 'F' })).toEqual({ key: 'Ab', source: 'personal' });
  });

  it('без личной — тональность сетлиста', () => {
    expect(resolveEffectiveKey({ setlistKey: 'A', defaultKey: 'G', originalKey: 'F' })).toEqual({ key: 'A', source: 'setlist' });
  });

  it('без личной и сетлиста — основная', () => {
    expect(resolveEffectiveKey({ defaultKey: 'G', originalKey: 'F' })).toEqual({ key: 'G', source: 'default' });
  });

  it('пустой defaultKey ⇒ исходная', () => {
    expect(resolveEffectiveKey({ defaultKey: '', originalKey: 'F' })).toEqual({ key: 'F', source: 'original' });
    expect(resolveEffectiveKey({ originalKey: 'F' })).toEqual({ key: 'F', source: 'original' });
  });

  it('песня без единой тональности → null', () => {
    expect(resolveEffectiveKey({})).toBeNull();
  });
});

describe('semitonesBetween', () => {
  beforeEach(() => {
    resetSongKeyWarnings();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('считает сдвиг между тональностями', () => {
    expect(semitonesBetween('G', 'A')).toBe(2);
    expect(semitonesBetween('C', 'Eb')).toBe(3);
    expect(semitonesBetween('Em', 'Gm')).toBe(3);
  });

  it('одинаковые тональности — ноль', () => {
    expect(semitonesBetween('G', 'G')).toBe(0);
    expect(semitonesBetween('F#m', 'F#m')).toBe(0);
  });

  it('сдвиг вниз нормализуется в 0..11 (имена аккордов те же)', () => {
    expect(semitonesBetween('G', 'C')).toBe(5);
  });

  it('нераспознанная тональность → 0 и ровно один warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(semitonesBetween('Zz', 'G')).toBe(0);
    expect(semitonesBetween('G', 'Zz')).toBe(0);
    expect(semitonesBetween(undefined, 'G')).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('keyOptions', () => {
  it('сохраняет лад исходной тональности', () => {
    const major = keyOptions('G');
    expect(major).toContain('G');
    expect(major).toContain('Ab');
    expect(major.some((option) => option.endsWith('m'))).toBe(false);

    const minor = keyOptions('Em');
    expect(minor).toContain('Gm');
    expect(minor).toContain('Em');
    expect(minor.every((option) => option.endsWith('m'))).toBe(true);
  });

  it('содержит 12 тональностей', () => {
    expect(keyOptions('C')).toHaveLength(12);
  });

  it('энгармоническая исходная тональность попадает в список', () => {
    expect(keyOptions('Db')).toContain('Db');
    expect(keyOptions('Db')).toHaveLength(13);
  });

  it('нераспознанная исходная — пустой список', () => {
    expect(keyOptions('Zz')).toEqual([]);
    expect(keyOptions(undefined)).toEqual([]);
  });
});

describe('splitKey', () => {
  it('разбирает основу, знак и лад', () => {
    expect(splitKey('G')).toEqual({ base: 'G', accidental: '', minor: false });
    expect(splitKey('F#')).toEqual({ base: 'F', accidental: '#', minor: false });
    expect(splitKey('Ab')).toEqual({ base: 'A', accidental: 'b', minor: false });
    expect(splitKey('Em')).toEqual({ base: 'E', accidental: '', minor: true });
    expect(splitKey('C#m')).toEqual({ base: 'C', accidental: '#', minor: true });
  });

  it('нераспознанное и двойной знак ⇒ null', () => {
    expect(splitKey(undefined)).toBeNull();
    expect(splitKey('Zz')).toBeNull();
    expect(splitKey('C##')).toBeNull();
  });
});

describe('keyFromParts', () => {
  it('нормализует энгармоники к спеллингу CHROMATIC_MAJOR', () => {
    expect(keyFromParts('D', 'b', false)).toBe('C#');
    expect(keyFromParts('D', '#', false)).toBe('Eb');
    expect(keyFromParts('G', 'b', false)).toBe('F#');
    expect(keyFromParts('A', '#', false)).toBe('Bb');
    expect(keyFromParts('C', 'b', false)).toBe('B');
    expect(keyFromParts('E', '#', false)).toBe('F');
  });

  it('сохраняет лад и результат входит в keyOptions', () => {
    expect(keyFromParts('E', '', true)).toBe('Em');
    expect(keyOptions('Am')).toContain(keyFromParts('D', 'b', true));
  });
});

describe('keyByOffset', () => {
  it('сдвигает в обе стороны и нормализует по mod 12', () => {
    expect(keyByOffset('A', 2)).toBe('B');
    expect(keyByOffset('A', -2)).toBe('G');
    expect(keyByOffset('C', -1)).toBe('B');
    expect(keyByOffset('C', 13)).toBe('C#');
    expect(keyByOffset('C', -9)).toBe('Eb');
  });

  it('сохраняет лад, результат всегда в keyOptions', () => {
    expect(keyByOffset('Em', 3)).toBe('Gm');
    for (let n = -9; n <= 6; n += 1) {
      const result = keyByOffset('A', n);
      expect(keyOptions('A')).toContain(result);
    }
  });

  it('нераспознанная тональность ⇒ undefined', () => {
    expect(keyByOffset(undefined, 1)).toBeUndefined();
    expect(keyByOffset('Zz', 1)).toBeUndefined();
  });
});
