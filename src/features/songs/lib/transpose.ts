/**
 * Транспозиция аккордов ChordPro (§10.2, §10.3).
 *
 * Точка применения — сырая строка ChordPro перед рендером: переписывается только
 * содержимое `[...]` с `kind: 'chord'`, дальше идёт существующий рендер-путь без изменений
 * (типографика аккорда в `ChordRenderer` не трогается, §3.4).
 *
 * Спеллинг (диезы/бемоли) берётся из ЦЕЛЕВОЙ тональности, а не из направления сдвига:
 * `+3` от `C` — это `Eb` в Eb-мажоре и `D#` в D#-миноре. Иначе музыканты получают `A#`
 * вместо `Bb` (§10.2).
 *
 * Суффикс аккорда сохраняется дословно (`Gsus` не превращается в `Gsus4`): в корпусе
 * встречается авторская запись, нормализовать её незачем.
 *
 * Логирования здесь нет намеренно: функции вызываются на каждый маркер, а в корпусе
 * до 42 аккордовых строк на песню — любой лог превращается в спам.
 */
import { Chord, Key, Note } from 'tonal';
import { classifyMarker } from './markers';

/** Корень аккорда/басовой ноты: буква + до двух знаков альтерации. */
const ROOT_RE = /^([A-G](?:#|b){0,2})(.*)$/;
const MARKER_RE = /\[([^\]]*)\]/g;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Тональность как она лежит в данных: `"G"`, `"Ab"`, `"F#m"`, `"Em"`. */
export interface ParsedKey {
  tonic: string;
  minor: boolean;
}

/**
 * Разбор тональности на тонику и лад. Нераспознанное → `null`: вызывающий сам решает,
 * что делать (в `songKey.ts` это ноль полутонов + однократный warn).
 */
export function parseKey(key: string | undefined | null): ParsedKey | null {
  if (!key) return null;
  const trimmed = key.trim();
  // Минор в корпусе пишется как `Em`/`F#m`; `maj`/`M` — мажор.
  const minorMatch = /^([A-G](?:#|b){0,2})m(?:in)?$/.exec(trimmed);
  if (minorMatch) return { tonic: minorMatch[1], minor: true };
  const majorMatch = /^([A-G](?:#|b){0,2})(?:maj|M)?$/.exec(trimmed);
  if (majorMatch) return { tonic: majorMatch[1], minor: false };
  return null;
}

/**
 * Таблица «полутон → как его писать» для целевой тональности.
 *
 * Семь ступеней приходят из гаммы (`Key.majorKey` / `Key.minorKey().natural`), остальные
 * пять — из хроматики со знаком, преобладающим в этой гамме. Нераспознанная тональность
 * даёт диезы: это не отказ, а нейтральный дефолт, ошибка уже залогирована в `songKey.ts`.
 */
function spellingTable(targetKey: string): readonly string[] {
  const parsed = parseKey(targetKey);
  const scale = parsed ? (parsed.minor ? Key.minorKey(parsed.tonic).natural.scale : Key.majorKey(parsed.tonic).scale) : [];

  const preferFlats = scale.length > 0 ? scale.some((note) => note.includes('b')) : Boolean(parsed?.tonic.includes('b'));
  const table = [...(preferFlats ? FLAT_NAMES : SHARP_NAMES)];

  for (const note of scale) {
    const chroma = Note.chroma(note);
    if (chroma != null) table[chroma] = note;
  }
  return table;
}

/** Транспонирует одну ноту (корень или бас), сохраняя суффикс аккорда как есть. */
function transposeRoot(text: string, semitones: number, table: readonly string[]): string | null {
  const match = ROOT_RE.exec(text);
  if (!match) return null;
  const chroma = Note.chroma(match[1]);
  if (chroma == null || Number.isNaN(chroma)) return null;
  return table[(((chroma + semitones) % 12) + 12) % 12] + match[2];
}

/** Один аккорд цепочки: `C/G` → корень и бас транспонируются по отдельности (§10.3). */
function transposeSingleChord(text: string, semitones: number, table: readonly string[]): string {
  // Нераспознанное возвращаем как есть: `[C#mсть.]` — данные корпуса, а не сбой (§10.3).
  if (Chord.get(text).empty) return text;

  const [root, ...rest] = text.split('/');
  const transposedRoot = transposeRoot(root, semitones, table);
  if (transposedRoot === null) return text;

  const transposedRest = rest.map((bass) => transposeRoot(bass, semitones, table) ?? bass);
  return [transposedRoot, ...transposedRest].join('/');
}

/**
 * Транспозиция содержимого одного chord-маркера. Цепочка `E-B/D#-E/D` разбивается по `-`,
 * каждый элемент транспонируется отдельно и собирается обратно (§10.3).
 */
export function transposeChord(text: string, semitones: number, targetKey: string): string {
  if (semitones === 0) return text;
  return transposeChain(text, semitones, spellingTable(targetKey));
}

/** Цепочка аккордов с уже построенной таблицей спеллинга (одна таблица на строку). */
function transposeChain(text: string, semitones: number, table: readonly string[]): string {
  return text
    .split('-')
    .map((part) => transposeSingleChord(part, semitones, table))
    .join('-');
}

/**
 * Транспозиция строки ChordPro. Маркеры `bar` (`[|]`) и `note` (`[(пауза)]`) проходят
 * насквозь; текст лирики не трогается.
 */
export function transposeLine(line: string, semitones: number, targetKey: string): string {
  if (semitones === 0) return line;
  const table = spellingTable(targetKey);
  return line.replace(MARKER_RE, (whole: string, inner: string) => {
    const marker = classifyMarker(inner);
    if (marker.kind !== 'chord') return whole;
    const transposed = transposeChain(marker.text, semitones, table);
    // Не изменился — отдаём исходный маркер дословно (сохраняем возможные пробелы внутри).
    return transposed === marker.text ? whole : `[${transposed}]`;
  });
}
