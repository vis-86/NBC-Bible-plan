/**
 * Утилиты для парсинга ChordPro, основанные на оригинальном проекте.
 * Pure TS — без React/браузерных зависимостей.
 */

/**
 * Проверяет, является ли строка директивой ChordPro
 */
export function isDirective(line: string): boolean {
  return /^\s*\{[^}]+\}\s*$/.test(line.trim());
}

/**
 * Парсит директиву из строки
 *
 * @param line - строка с директивой
 * @returns объект с типом директивы и значением, или null
 */
export function parseDirective(line: string): { type: string; value?: string } | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^\s*\{\s*([^:}]+)(?::\s*(.+?))?\s*\}\s*$/);

  if (!match) return null;

  const [, directive, value] = match;
  const normalized = directive.toLowerCase().trim();

  return {
    type: normalized,
    value: value?.trim(),
  };
}

/**
 * Проверяет, является ли директива началом припева
 */
export function isStartOfChorus(directive: string): boolean {
  return /^(start_of_chorus|soc)$/.test(directive.toLowerCase());
}

/**
 * Проверяет, является ли директива концом припева
 */
export function isEndOfChorus(directive: string): boolean {
  return /^(end_of_chorus|eoc)$/.test(directive.toLowerCase());
}

/**
 * Проверяет, является ли директива вставкой припева
 */
export function isChorusRepeat(directive: string): boolean {
  return /^(chorus)$/.test(directive.toLowerCase());
}

/**
 * Проверяет, является ли директива комментарием
 */
export function isComment(directive: string): boolean {
  return /^(comment|c|highlight)$/.test(directive.toLowerCase());
}

/**
 * Проверяет, является ли директива курсивным комментарием
 */
export function isCommentItalic(directive: string): boolean {
  return /^(comment_italic|ci)$/.test(directive.toLowerCase());
}

/**
 * Проверяет, является ли директива комментарием в рамке
 */
export function isCommentBox(directive: string): boolean {
  return /^(comment_box|cb)$/.test(directive.toLowerCase());
}

/**
 * Проверяет, является ли директива метаданными
 */
export function isMetadata(directive: string): boolean {
  const metadataKeys = ['title', 'subtitle', 'artist', 'key', 'tempo', 'time', 'capo'];
  return metadataKeys.includes(directive.toLowerCase());
}
