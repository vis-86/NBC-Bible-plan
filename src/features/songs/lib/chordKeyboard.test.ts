import { describe, expect, it } from 'vitest';
import { chromaticRoots, diatonicChords } from './chordKeyboard';

describe('diatonicChords', () => {
  it('мажор: I ii iii IV V vi vii°', () => {
    expect(diatonicChords('A')).toEqual([
      { chord: 'A', degree: 'I' },
      { chord: 'Bm', degree: 'ii' },
      { chord: 'C#m', degree: 'iii' },
      { chord: 'D', degree: 'IV' },
      { chord: 'E', degree: 'V' },
      { chord: 'F#m', degree: 'vi' },
      { chord: 'G#dim', degree: 'vii°' },
    ]);
  });

  it('минор — натуральный: i ii° III iv v VI VII', () => {
    expect(diatonicChords('Em')?.map((d) => d.chord)).toEqual(['Em', 'F#dim', 'G', 'Am', 'Bm', 'C', 'D']);
  });

  it('бемольная тональность пишется бемолями', () => {
    expect(diatonicChords('F')?.map((d) => d.chord)).toContain('Bb');
  });

  it('нет тональности или она не распознана — null', () => {
    expect(diatonicChords(undefined)).toBeNull();
    expect(diatonicChords('Ля')).toBeNull();
  });
});

describe('chromaticRoots', () => {
  it('диезы по умолчанию и в диезных тональностях', () => {
    expect(chromaticRoots(undefined)).toContain('F#');
    expect(chromaticRoots('E')).toContain('G#');
  });

  it('бемоли в бемольных, включая минор', () => {
    expect(chromaticRoots('Bb')).toContain('Eb');
    expect(chromaticRoots('Dm')).toContain('Bb');
  });
});
