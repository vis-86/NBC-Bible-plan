import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyOptions, resetSongKeyWarnings, resolveEffectiveKey, semitonesBetween } from './songKey';

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
