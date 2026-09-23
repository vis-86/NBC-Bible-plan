import { Key } from 'tonal';
import { splitKey } from './songKey';

/**
 * Данные клавиатуры аккордов редактора (M9, T3b): ступени тональности готовыми кнопками
 * и хроматика за «Ещё». Спеллинг — по знакам тональности (`tonal`): в `F` это `Bb`, а не
 * `A#`, иначе аккорд на листе разошёлся бы с тем, как его пишут в этой тональности.
 */

export interface DegreeChord {
  chord: string;
  /** Римская ступень: регистр — лад (`ii` минорная, `IV` мажорная), как принято у музыкантов. */
  degree: string;
}

const MAJOR_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_DEGREES = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

const SHARP_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function parse(key: string | undefined): { tonic: string; minor: boolean } | null {
  const parts = splitKey(key);
  return parts ? { tonic: parts.base + parts.accidental, minor: parts.minor } : null;
}

/** Семь аккордов тональности (натуральный минор для минорной). Нераспознанная тональность ⇒ `null`. */
export function diatonicChords(key: string | undefined): DegreeChord[] | null {
  const parsed = parse(key);
  if (!parsed) return null;
  const triads = parsed.minor ? Key.minorKey(parsed.tonic).natural.triads : Key.majorKey(parsed.tonic).triads;
  if (triads.length !== 7) return null;
  const degrees = parsed.minor ? MINOR_DEGREES : MAJOR_DEGREES;
  return triads.map((chord, i) => ({ chord, degree: degrees[i] }));
}

/** 12 нот от `C` — бемолями в бемольных тональностях, иначе диезами. Без тональности — диезами. */
export function chromaticRoots(key: string | undefined): string[] {
  const parsed = parse(key);
  if (!parsed) return SHARP_ROOTS;
  const alteration = parsed.minor ? Key.minorKey(parsed.tonic).alteration : Key.majorKey(parsed.tonic).alteration;
  return alteration < 0 ? FLAT_ROOTS : SHARP_ROOTS;
}
