/**
 * Разбор и переключение качества аккорда (M9) — для клавиатуры редактора.
 *
 * Модификатор в редакторе — это ПЕРЕКЛЮЧАТЕЛЬ на самом аккорде, а не режим ввода:
 * нажал `m` на выбранном `A` — стал `Am`, нажал ещё раз — вернулся в `A`. Поэтому
 * нужен разбор в составляющие, а не правка строки заменами: замена давала и неверный
 * порядок (`Asus47` вместо `A7sus4`), и несуществующие сочетания (`Amsus4` — sus
 * убирает терцию, которую задаёт минор).
 *
 * Нераспознанный хвост (`dim`, `aug`, `9`, `11`, и мусор корпуса вроде `mсть.`)
 * сохраняется дословно: данные важнее теории, песню нельзя испортить правкой соседнего
 * свойства. По той же причине функции никогда не бросают.
 *
 * Тоника здесь ТОЛЬКО латинская: русская `H` конвертируется на входе в приложение
 * (`importChordsOverLyrics`), внутри хранится английская нотация.
 *
 * Pure TS — без React и браузерных API.
 */

/** Переключатели клавиатуры редактора, в порядке показа. */
export const CHORD_MODS = ['m', '7', 'maj7', 'sus4', 'sus2', 'add9'] as const;
export type ChordMod = (typeof CHORD_MODS)[number];

export interface ChordQuality {
  root: string;
  minor: boolean;
  /** Септима: либо малая (`7`), либо большая (`maj7`) — взаимоисключающи. */
  seventh: '7' | 'maj7' | null;
  add9: boolean;
  /** Задержание: `sus4` либо `sus2` — взаимоисключающи и несовместимы с терцией. */
  sus: 'sus4' | 'sus2' | null;
  /** Нераспознанный хвост суффикса, сохраняется дословно. */
  extra: string;
  /** Басовая нота вместе со слэшем (`/B`), либо пустая строка. */
  bass: string;
}

const ROOT_RE = /^([A-G][#b]?)(.*)$/;

/** Разбор не бросает: нераспознанное уходит в `extra` при пустой тонике. */
export function parseChordQuality(chord: string): ChordQuality {
  const match = ROOT_RE.exec(chord ?? '');
  if (!match) {
    return { root: '', minor: false, seventh: null, add9: false, sus: null, extra: chord ?? '', bass: '' };
  }

  const [, root, rest] = match;
  const slash = rest.indexOf('/');
  let suffix = slash < 0 ? rest : rest.slice(0, slash);
  const bass = slash < 0 ? '' : rest.slice(slash);

  // `maj` начинается с `m`, поэтому минор проверяется с оглядкой на него.
  const minor = /^m(?!aj)/.test(suffix);
  if (minor) suffix = suffix.slice(1);

  let seventh: ChordQuality['seventh'] = null;
  if (suffix.includes('maj7')) {
    seventh = 'maj7';
    suffix = suffix.replace('maj7', '');
  } else if (suffix.includes('7')) {
    seventh = '7';
    suffix = suffix.replace('7', '');
  }

  const add9 = suffix.includes('add9');
  if (add9) suffix = suffix.replace('add9', '');

  let sus: ChordQuality['sus'] = null;
  if (suffix.includes('sus4')) {
    sus = 'sus4';
    suffix = suffix.replace('sus4', '');
  } else if (suffix.includes('sus2')) {
    sus = 'sus2';
    suffix = suffix.replace('sus2', '');
  } else if (suffix.includes('sus')) {
    // Авторская запись корпуса `Gsus` — это sus4.
    sus = 'sus4';
    suffix = suffix.replace('sus', '');
  }

  return { root, minor, seventh, add9, sus, extra: suffix, bass };
}

/** Канонический порядок записи — один на всё приложение. */
export function formatChordQuality(q: ChordQuality): string {
  return (
    q.root +
    (q.minor ? 'm' : '') +
    (q.seventh ?? '') +
    (q.add9 ? 'add9' : '') +
    (q.sus ?? '') +
    q.extra +
    q.bass
  );
}

/** Горит ли переключатель для этого аккорда. */
export function hasChordMod(chord: string, mod: ChordMod): boolean {
  const q = parseChordQuality(chord);
  switch (mod) {
    case 'm':
      return q.minor;
    case '7':
      return q.seventh === '7';
    case 'maj7':
      return q.seventh === 'maj7';
    case 'sus4':
      return q.sus === 'sus4';
    case 'sus2':
      return q.sus === 'sus2';
    case 'add9':
      return q.add9;
  }
}

/**
 * Переключение свойства. Несовместимые части гасят друг друга, поэтому результат
 * всегда остаётся осмысленным аккордом.
 */
export function toggleChordMod(chord: string, mod: ChordMod): string {
  const q = parseChordQuality(chord);
  switch (mod) {
    case 'm':
      q.minor = !q.minor;
      if (q.minor) q.sus = null; // sus убирает терцию, минор её задаёт
      break;
    case '7':
      q.seventh = q.seventh === '7' ? null : '7';
      break;
    case 'maj7':
      q.seventh = q.seventh === 'maj7' ? null : 'maj7';
      break;
    case 'add9':
      q.add9 = !q.add9;
      break;
    case 'sus4':
      q.sus = q.sus === 'sus4' ? null : 'sus4';
      if (q.sus) q.minor = false;
      break;
    case 'sus2':
      q.sus = q.sus === 'sus2' ? null : 'sus2';
      if (q.sus) q.minor = false;
      break;
  }
  return formatChordQuality(q);
}

/** Басовая нота: пустая строка снимает её. */
export function setChordBass(chord: string, bass: string): string {
  const q = parseChordQuality(chord);
  const trimmed = bass.trim();
  q.bass = trimmed ? `/${trimmed.replace(/^\//, '')}` : '';
  return formatChordQuality(q);
}

export function getChordBass(chord: string): string {
  return parseChordQuality(chord).bass.replace(/^\//, '');
}
