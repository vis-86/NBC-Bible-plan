/**
 * Разрешение действующей тональности песни (§10.1) и вычисление сдвига в полутонах (§10.2).
 *
 * Три уровня тональности путают в первую очередь, поэтому они разведены по именам:
 * `originalKey` — в ней записаны аккорды в `content`; `defaultKey` — в ней обычно играет
 * команда; `personalKey`/`setlistKey` — рабочая, на служение или лично для себя.
 *
 * Хранится тональность (строка), а не полутона: `+3` от `C` — это `D#` или `Eb`,
 * ответ даёт только целевая тональность (§10.2).
 */
import { Interval, Note } from 'tonal';
import { parseKey } from './transpose';

export type SongKeySource = 'personal' | 'setlist' | 'default' | 'original';

export interface EffectiveKeyInput {
  /** Личная тональность музыканта (перебивает всё, но только для него). */
  personalKey?: string;
  /** Тональность позиции в сетлисте. До M7 всегда `undefined` — сетлистов нет. */
  setlistKey?: string;
  /** `songs.default_key` — пустой ⇒ действует `originalKey`. */
  defaultKey?: string;
  /** `songs.song_key` — тональность, в которой записаны аккорды. */
  originalKey?: string;
}

export interface EffectiveKey {
  key: string;
  source: SongKeySource;
}

/** Тональности для селектора — 12 полутонов, лад берётся из исходной (§10.3). */
const CHROMATIC_MAJOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

let warnedUnknownKey = false;

function warnUnknownKey(context: Record<string, unknown>): void {
  if (warnedUnknownKey) return;
  warnedUnknownKey = true;
  console.warn('[songKey] unknown key', context);
}

/** Первое непустое: `personal → setlist → default → original` (§10.1). */
export function resolveEffectiveKey({ personalKey, setlistKey, defaultKey, originalKey }: EffectiveKeyInput): EffectiveKey | null {
  if (personalKey) return { key: personalKey, source: 'personal' };
  if (setlistKey) return { key: setlistKey, source: 'setlist' };
  if (defaultKey) return { key: defaultKey, source: 'default' };
  if (originalKey) return { key: originalKey, source: 'original' };
  // У песни нет ни одной тональности (в корпусе такое есть) — транспонировать нечего.
  return null;
}

/**
 * Сдвиг в полутонах от исходной тональности к действующей.
 *
 * Нераспознанная тональность (любая из двух) ⇒ `0`: рендер идёт без транспозиции, а не
 * падает на данных. Warn однократный — иначе спам на каждый ре-рендер песни.
 */
export function semitonesBetween(originalKey: string | undefined, effectiveKey: string | undefined): number {
  const from = parseKey(originalKey);
  const to = parseKey(effectiveKey);
  if (!from || !to) {
    warnUnknownKey({ originalKey, effectiveKey });
    return 0;
  }

  const semitones = Interval.semitones(Interval.distance(from.tonic, to.tonic));
  if (semitones == null || Number.isNaN(semitones)) {
    warnUnknownKey({ originalKey, effectiveKey });
    return 0;
  }
  // Нормализуем в 0..11: переписываются только имена аккордов (без октав), поэтому
  // «вниз на квинту» и «вверх на кварту» дают один и тот же результат.
  return ((semitones % 12) + 12) % 12;
}

/**
 * Список тональностей для селектора — в том же ладу, что исходная: если `originalKey = Em`,
 * выбор «G» означает `Gm`, а не `G` (§10.3). Нераспознанная исходная ⇒ пустой список
 * (выбирать не из чего, селектор не рендерится).
 */
export function keyOptions(originalKey: string | undefined): string[] {
  const parsed = parseKey(originalKey);
  if (!parsed) return [];
  const options = CHROMATIC_MAJOR.map((tonic) => (parsed.minor ? `${tonic}m` : tonic));
  // Энгармонический вариант исходной тональности (`Db` при нашем `C#`) в хроматике
  // отсутствует — добавляем, чтобы действующая тональность всегда была в списке.
  const original = parsed.minor ? `${parsed.tonic}m` : parsed.tonic;
  return options.includes(original) ? options : [original, ...options];
}

/** Основа тональности без знака — семь кнопок панели «Транспонирование» (§10.3). */
export type KeyBase = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
/** Знак при основе: бемоль, натурал (без знака), диез. */
export type KeyAccidental = '' | '#' | 'b';

export interface KeyParts {
  base: KeyBase;
  accidental: KeyAccidental;
  minor: boolean;
}

/**
 * Разбор тональности на основу+знак+лад для панели транспозиции. Нераспознанное или
 * тональность с двойным знаком (в корпусе не встречается) ⇒ `null` — панель тогда просто
 * не подсвечивает основу, а не падает.
 */
export function splitKey(key: string | undefined): KeyParts | null {
  const parsed = parseKey(key);
  if (!parsed) return null;
  const base = parsed.tonic[0] as KeyBase;
  const accidental = parsed.tonic.slice(1);
  if (accidental !== '' && accidental !== '#' && accidental !== 'b') return null;
  return { base, accidental, minor: parsed.minor };
}

/**
 * Сборка тональности из основы+знака с нормализацией в спеллинг `CHROMATIC_MAJOR`
 * (`Db→C#`, `D#→Eb`, `Gb→F#`, `A#→Bb`, `Cb→B`, `E#→F`). Нормализация обязательна: без неё
 * `Db` из панели не совпал бы с `C#` в `keyOptions`, и подсветка «выбрано» отвалилась бы.
 * Нераспознанная нота (например `B#` вне таблицы) ⇒ пустая строка — вызывающий это не пишет.
 */
export function keyFromParts(base: KeyBase, accidental: KeyAccidental, minor: boolean): string {
  const chroma = Note.chroma(`${base}${accidental}`);
  if (chroma == null || Number.isNaN(chroma)) return '';
  return CHROMATIC_MAJOR[chroma] + (minor ? 'm' : '');
}

/**
 * Тональность, отстоящая от `key` на `semitones` (любой знак и модуль: слайдер даёт −6…+6,
 * каподастр — до −9). Результат нормализован по mod 12 в спеллинг `CHROMATIC_MAJOR`, поэтому
 * всегда входит в `keyOptions(key)`. Нераспознанная `key` ⇒ `undefined` (не бросаем).
 */
export function keyByOffset(key: string | undefined, semitones: number): string | undefined {
  const parsed = parseKey(key);
  if (!parsed) return undefined;
  const chroma = Note.chroma(parsed.tonic);
  if (chroma == null || Number.isNaN(chroma)) return undefined;
  const shifted = (((chroma + semitones) % 12) + 12) % 12;
  return CHROMATIC_MAJOR[shifted] + (parsed.minor ? 'm' : '');
}

/** Только для тестов: сбрасывает флаг однократного warn. */
export function resetSongKeyWarnings(): void {
  warnedUnknownKey = false;
}
