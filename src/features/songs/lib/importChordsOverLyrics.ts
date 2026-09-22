/**
 * Импорт песни из формата «аккорды над строкой» в ChordPro (M9).
 *
 * Музыканты берут песни с холихордса и из блокнотов, где аккорды выровнены пробелами
 * над строкой текста. Это единственный формат, которым они реально владеют, поэтому
 * вводом служит вставка такого текста, а ChordPro остаётся форматом хранения.
 *
 * Эвристика распознавания аккордовой строки — отраслевая (так же делают chordpro.org
 * и OnSong): строка считается аккордовой, когда ВСЕ её токены — валидные аккорды либо
 * служебные символы, и есть хотя бы один аккорд. Одно нераспознанное слово переводит
 * строку в текст: потерять аккорд хуже, чем не распознать разметку.
 *
 * Русская нотация (`H` = си, `B` = си-бемоль) определяется автоматически по наличию
 * `H`-аккорда. Без этого `Hm` из холихордса стал бы чужим аккордом: `tonal`, на которой
 * держится транспозиция, ноту `H` не знает вообще.
 *
 * Pure TS — без React и браузерных API, поэтому тестируется без окружения.
 */

/** `ru`: H = си, B = си-бемоль. `en`: B = си. */
export type ChordNotation = 'ru' | 'en';

export interface ImportedSong {
  /** Готовый ChordPro без метаданных — их дописывает вызывающий из полей формы. */
  chordPro: string;
  /** Первая строка текста, если она не похожа на секцию или аккорды. */
  title?: string;
  /** Ссылка на источник, если во вставленном тексте был голый URL. */
  source?: string;
  notation: ChordNotation;
  stats: ImportStats;
}

export interface ImportStats {
  sections: number;
  chordLines: number;
  chords: number;
  /** Аккордовые строки, под которыми не оказалось текста (проигрыши, схемы тактов). */
  standaloneChordLines: number;
}

/**
 * Один аккорд: тоника + суффикс + необязательный бас.
 * `H` допускается на входе — конвертация нотации происходит ПОСЛЕ распознавания.
 */
const SINGLE_CHORD = /^[A-H][#b]?(?:maj|min|m|sus|add|aug|dim|°|\+|\d)*(?:\/[A-H][#b]?)?$/;

/** Служебные токены аккордовой строки: тактовые черты, репризы, счёт долей, повторы. */
const STRUCTURAL = new Set([
  '|', '||', '|||', '/', '//', '///', '////',
  '||:', ':||', '|||:', ':|||', '-', '–', '—',
]);

/** `х2` (кириллица) и `x2` (латиница) — музыканты пишут и так, и так. */
const REPEAT_TOKEN = /^[xх]\d+$/i;

/** Ремарка исполнителю прямо в аккордовой строке: `(тихо)`, `(ff)`. */
const REMARK_TOKEN = /^\(.*\)$/;

/**
 * Цепочка аккордов через дефис (`E-B/D#-E/D`) — реальная запись корпуса, её понимают
 * и транспозиция, и свёртка баса. Поэтому цепочка считается ОДНИМ токеном-аккордом.
 */
export function isChordToken(token: string): boolean {
  if (!token) return false;
  const parts = token.split('-');
  return parts.length > 0 && parts.every((part) => SINGLE_CHORD.test(part));
}

function isStructuralToken(token: string): boolean {
  return STRUCTURAL.has(token) || REPEAT_TOKEN.test(token) || REMARK_TOKEN.test(token);
}

interface Token {
  text: string;
  /** Колонка начала токена в исходной строке — по ней аккорд привязывается к букве. */
  column: number;
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    tokens.push({ text: match[0], column: match.index });
  }
  return tokens;
}

function isChordLine(line: string): boolean {
  const tokens = tokenize(line);
  if (tokens.length === 0) return false;

  let chords = 0;
  for (const { text } of tokens) {
    if (isChordToken(text)) chords++;
    else if (!isStructuralToken(text)) return false;
  }
  return chords > 0;
}

/**
 * Тактовая схема (`| F#m /// | D /// |`) — самостоятельная строка: текста под ней нет,
 * и попытка привязать её к следующей строке съела бы эту строку целиком.
 */
function isBarSchemaLine(tokens: Token[]): boolean {
  return tokens.some(({ text }) => /^:?\|+:?$/.test(text));
}

/** Заголовок секции: короткая строка, заканчивающаяся двоеточием (иногда с «х2»). */
const SECTION_LINE = /^(.{1,60}?):\s*(?:[xх](\d+))?\s*$/;

function parseSectionLine(line: string): { label: string } | null {
  const trimmed = line.trim();
  const match = SECTION_LINE.exec(trimmed);
  if (!match) return null;
  if (isChordLine(line)) return null;

  const label = match[1].trim();
  if (!label) return null;

  // Повтор уезжает В МЕТКУ секции: оставленный в тексте, он стал бы «словом песни».
  return { label: match[2] ? `${label} (x${match[2]})` : label };
}

const URL_LINE = /^https?:\/\/\S+$/;

/**
 * `H` → `B`, `B` → `Bb`. Порядок важен: сначала H, иначе получившееся из H `B`
 * тут же превратилось бы в `Bb`.
 */
function convertNote(note: string): string {
  if (note.startsWith('H')) return `B${note.slice(1)}`;
  if (note.startsWith('Bb')) return note;
  if (note.startsWith('B')) return `Bb${note.slice(1)}`;
  return note;
}

/** Конвертация одного аккорда (или цепочки) в английскую нотацию. */
export function convertChordNotation(chord: string, notation: ChordNotation): string {
  if (notation === 'en') return chord;
  return chord
    .split('-')
    .map((part) =>
      part
        .split('/')
        .map((piece) => piece.replace(/^([A-H][#b]?)/, (note) => convertNote(note)))
        .join('/'),
    )
    .join('-');
}

/**
 * Нотация определяется по `H` в позиции тоники. Проверять просто вхождение буквы нельзя:
 * `H` встречается внутри слов текста, а решение принимается по всему документу сразу.
 */
export function detectNotation(text: string): ChordNotation {
  for (const line of text.split('\n')) {
    if (!isChordLine(line)) continue;
    for (const { text: token } of tokenize(line)) {
      if (!isChordToken(token)) continue;
      if (/(^|[-/])H/.test(token)) return 'ru';
    }
  }
  return 'en';
}

/** Маркер ChordPro для токена аккордовой строки. */
function toMarker(token: string, notation: ChordNotation): string {
  if (isChordToken(token)) return `[${convertChordNotation(token, notation)}]`;
  if (/^:?\|+:?$/.test(token)) return '[|]';
  return token;
}

/**
 * Раскладывает аккорды строки по колонкам строки текста.
 *
 * Вставка идёт СПРАВА НАЛЕВО: каждая вставка удлиняет строку, и при движении слева
 * направо все последующие колонки уехали бы на длину уже вставленных маркеров.
 */
function mergeChordsIntoLyric(tokens: Token[], lyric: string, notation: ChordNotation): string {
  let result = lyric;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const { text, column } = tokens[i];
    const marker = isChordToken(text) ? `[${convertChordNotation(text, notation)}]` : `${text} `;
    // Аккорд за концом строки прижимается к её концу: в исходнике он часто висит
    // над пробелом после последнего слова.
    const at = Math.min(column, result.length);
    result = result.slice(0, at) + marker + result.slice(at);
  }
  return result.trimEnd();
}

export interface ImportOptions {
  /** Явно заданная нотация. По умолчанию определяется автоматически. */
  notation?: ChordNotation;
  /** Не считать первую строку названием (когда название уже введено в форме). */
  keepFirstLine?: boolean;
}

export function importChordsOverLyrics(raw: string, options: ImportOptions = {}): ImportedSong {
  const notation = options.notation ?? detectNotation(raw);
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const stats: ImportStats = { sections: 0, chordLines: 0, chords: 0, standaloneChordLines: 0 };

  let title: string | undefined;
  let source: string | undefined;
  let i = 0;

  while (i < lines.length && !lines[i].trim()) i++;

  // Первая содержательная строка — название, если она не секция и не аккорды.
  if (!options.keepFirstLine && i < lines.length) {
    const first = lines[i];
    if (!isChordLine(first) && !parseSectionLine(first) && !URL_LINE.test(first.trim())) {
      title = first.trim();
      i++;
    }
  }

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      out.push('');
      continue;
    }

    if (URL_LINE.test(trimmed)) {
      source = trimmed;
      continue;
    }

    const section = parseSectionLine(line);
    if (section) {
      out.push(`{comment: ${section.label}}`);
      stats.sections++;
      continue;
    }

    if (isChordLine(line)) {
      const tokens = tokenize(line);
      stats.chordLines++;
      stats.chords += tokens.filter(({ text }) => isChordToken(text)).length;

      const next = lines[i + 1];
      const nextIsLyric =
        !isBarSchemaLine(tokens) &&
        next !== undefined &&
        next.trim() !== '' &&
        !isChordLine(next) &&
        !parseSectionLine(next) &&
        !URL_LINE.test(next.trim());

      if (nextIsLyric) {
        out.push(mergeChordsIntoLyric(tokens, next, notation));
        i++;
        continue;
      }

      stats.standaloneChordLines++;
      out.push(tokens.map(({ text }) => toMarker(text, notation)).join(' '));
      continue;
    }

    out.push(line.trimEnd());
  }

  const chordPro = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { chordPro, title, source, notation, stats };
}
