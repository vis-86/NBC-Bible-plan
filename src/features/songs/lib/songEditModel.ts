import { isComment, isCommentBox, isCommentItalic, isDirective, parseDirective } from './chordProUtils';

/**
 * Модель холста «Аккорды» (M9, T3b): ChordPro построчно, аккорды отделены от текста.
 *
 * Разбор БЕЗ ПОТЕРЬ: `serializeEditModel(parseEditModel(x)) === x` для любого текста —
 * это гейт корпусного теста. Холст правит только аккорды в строках текста; директивы,
 * пустые строки и всё непонятное лежат `raw` и возвращаются в ChordPro байт в байт.
 */

/** Аккорд в строке: `pos` — индекс символа текста, перед которым он стоит. */
export interface PlacedChord {
  pos: number;
  chord: string;
}

export type EditLine =
  | { kind: 'lyric'; text: string; chords: PlacedChord[] }
  | { kind: 'label'; label: string; source: string }
  | { kind: 'raw'; source: string };

export type LyricLine = Extract<EditLine, { kind: 'lyric' }>;

/** Выбранный аккорд: строка + индекс в `chords` (позиции не уникальны — `[G][|]`). */
export interface ChordRef {
  line: number;
  index: number;
}

const CHORD_MARKER = /\[([^\]]*)\]/g;

function parseLyric(source: string): LyricLine {
  const chords: PlacedChord[] = [];
  let text = '';
  let last = 0;
  for (const match of source.matchAll(CHORD_MARKER)) {
    text += source.slice(last, match.index);
    chords.push({ pos: text.length, chord: match[1] });
    last = match.index + match[0].length;
  }
  text += source.slice(last);
  return { kind: 'lyric', text, chords };
}

function parseLine(source: string): EditLine {
  if (!source.trim()) return { kind: 'raw', source };
  if (isDirective(source)) {
    const directive = parseDirective(source);
    if (directive && (isComment(directive.type) || isCommentItalic(directive.type) || isCommentBox(directive.type))) {
      return { kind: 'label', label: directive.value ?? '', source };
    }
    return { kind: 'raw', source };
  }
  return parseLyric(source);
}

export function parseEditModel(chordPro: string): EditLine[] {
  return chordPro.split('\n').map(parseLine);
}

export function serializeLyric(line: LyricLine): string {
  let out = '';
  let prev = 0;
  for (const { pos, chord } of line.chords) {
    out += `${line.text.slice(prev, pos)}[${chord}]`;
    prev = pos;
  }
  return out + line.text.slice(prev);
}

export function serializeEditModel(lines: EditLine[]): string {
  return lines.map((line) => (line.kind === 'lyric' ? serializeLyric(line) : line.source)).join('\n');
}

/** Строка без слов — вступление, проигрыш, схема тактов: аккорды идут цепочкой, без позиций. */
export function isChordOnlyLine(line: LyricLine): boolean {
  return line.text.trim() === '';
}

export function lyricAt(lines: EditLine[], index: number): LyricLine | null {
  const line = lines[index];
  return line?.kind === 'lyric' ? line : null;
}

function withLyric(lines: EditLine[], index: number, next: LyricLine): EditLine[] {
  const copy = lines.slice();
  copy[index] = next;
  return copy;
}

/** Индекс вставки, сохраняющий порядок по `pos`: новый аккорд встаёт после стоящих на той же позиции. */
function insertionIndex(chords: PlacedChord[], pos: number): number {
  let i = 0;
  while (i < chords.length && chords[i].pos <= pos) i++;
  return i;
}

/**
 * Ставит аккорд. В строку со словами — на позицию `pos`, заменяя стоящий там ровно
 * на той же позиции (тап по слогу под аккордом + ступень = «поменять аккорд»). В строку
 * без слов — в конец цепочки: позиции там смысла не имеют.
 */
export function insertChord(lines: EditLine[], lineIndex: number, pos: number, chord: string): { lines: EditLine[]; ref: ChordRef } {
  const line = lyricAt(lines, lineIndex);
  if (!line) throw new Error(`insertChord: line ${lineIndex} is not a lyric line`);

  if (isChordOnlyLine(line)) {
    const chords = [...line.chords, { pos: line.text.length, chord }];
    return { lines: withLyric(lines, lineIndex, { ...line, chords }), ref: { line: lineIndex, index: chords.length - 1 } };
  }

  const clamped = Math.max(0, Math.min(pos, line.text.length));
  const existing = line.chords.findIndex((c) => c.pos === clamped);
  if (existing !== -1) {
    const chords = line.chords.map((c, i) => (i === existing ? { ...c, chord } : c));
    return { lines: withLyric(lines, lineIndex, { ...line, chords }), ref: { line: lineIndex, index: existing } };
  }
  const index = insertionIndex(line.chords, clamped);
  const chords = [...line.chords.slice(0, index), { pos: clamped, chord }, ...line.chords.slice(index)];
  return { lines: withLyric(lines, lineIndex, { ...line, chords }), ref: { line: lineIndex, index } };
}

export function chordAt(lines: EditLine[], ref: ChordRef): PlacedChord | null {
  return lyricAt(lines, ref.line)?.chords[ref.index] ?? null;
}

export function replaceChord(lines: EditLine[], ref: ChordRef, chord: string): EditLine[] {
  const line = lyricAt(lines, ref.line);
  if (!line || !line.chords[ref.index]) return lines;
  const chords = line.chords.map((c, i) => (i === ref.index ? { ...c, chord } : c));
  return withLyric(lines, ref.line, { ...line, chords });
}

export function removeChord(lines: EditLine[], ref: ChordRef): EditLine[] {
  const line = lyricAt(lines, ref.line);
  if (!line || !line.chords[ref.index]) return lines;
  return withLyric(lines, ref.line, { ...line, chords: line.chords.filter((_, i) => i !== ref.index) });
}

/** Соседняя строка со словами — цель переноса ↑/↓. Метки, пустые и аккордовые строки пропускаются. */
export function neighbourTextLine(lines: EditLine[], from: number, direction: -1 | 1): number | null {
  for (let i = from + direction; i >= 0 && i < lines.length; i += direction) {
    const line = lyricAt(lines, i);
    if (line && !isChordOnlyLine(line)) return i;
  }
  return null;
}

/**
 * Перенос аккорда на другую строку со словами — на ту же позицию, прижатую к длине
 * целевой строки. Дискретный шаг вместо перетаскивания между строками: так аккорд
 * невозможно потерять (UX-модель плана M9).
 */
export function moveChordToLine(lines: EditLine[], ref: ChordRef, target: number): { lines: EditLine[]; ref: ChordRef } {
  const source = chordAt(lines, ref);
  const targetLine = lyricAt(lines, target);
  if (!source || !targetLine || target === ref.line) return { lines, ref };

  const without = removeChord(lines, ref);
  const pos = Math.min(source.pos, targetLine.text.length);
  const index = insertionIndex(targetLine.chords, pos);
  const chords = [...targetLine.chords.slice(0, index), { pos, chord: source.chord }, ...targetLine.chords.slice(index)];
  return { lines: withLyric(without, target, { ...targetLine, chords }), ref: { line: target, index } };
}
