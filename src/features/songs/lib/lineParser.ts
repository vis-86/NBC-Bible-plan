/**
 * Утилиты для парсинга строк ChordPro
 * Принцип: Single Responsibility - только парсинг, без рендеринга
 */

export interface ParsedToken {
  type: 'chord' | 'text';
  value: string;
}

export interface ParsedLine {
  tokens: ParsedToken[];
  isChordsOnly: boolean;
}

/**
 * Парсит строку на токены (аккорды и текст)
 */
export function parseLine(line: string): ParsedLine {
  const parts = line.split(/(\[.*?\])/g).filter(Boolean);
  const tokens: ParsedToken[] = [];

  for (const part of parts) {
    if (part.startsWith('[') && part.endsWith(']')) {
      tokens.push({
        type: 'chord',
        value: part.slice(1, -1),
      });
    } else if (part.trim()) {
      tokens.push({
        type: 'text',
        value: part,
      });
    }
  }

  const isChordsOnly = tokens.length > 0 && tokens.every((t) => t.type === 'chord');

  return { tokens, isChordsOnly };
}

/**
 * Разбивает строку на слова (по пробелам)
 */
export function splitIntoWords(line: string): string[] {
  return line.split(/(\s+)/g).filter(Boolean);
}

/**
 * Проверяет, содержит ли слово буквы (не только аккорды)
 */
export function hasLetters(word: string): boolean {
  return word.replace(/\[.*?\]/g, '').trim().length > 0;
}
