/**
 * Утилиты для парсинга ChordPro, основанные на оригинальном проекте.
 * Pure TS — без React/браузерных зависимостей.
 */

/**
 * Результат разбора строки на аккорды и текст
 */
export interface DecomposedLine {
  chords: string[];
  phrases: string[];
  hasIndent?: boolean;
  specialSymbols?: string[]; // Специальные символы в [] (например, [|], [(], [)])
}

/**
 * Проверяет, является ли содержимое в [] аккордом или специальным символом
 *
 * @param content - содержимое внутри []
 * @returns true если это аккорд, false если специальный символ
 *
 * @example
 * isChordSymbol("C") // true
 * isChordSymbol("D/F#") // true
 * isChordSymbol("|") // false
 * isChordSymbol("(") // false
 */
export function isChordSymbol(content: string): boolean {
  if (!content || content.trim() === '') return false;

  const trimmed = content.trim();

  // Сначала проверяем специальные символы - обычно одиночные символы
  // Специальные символы: |, (, ), -, и т.д.
  // Если это только специальные символы без букв/цифр - это не аккорд
  const specialSymbolPattern = /^[|()\-_=+*&%$@!~`'":;,.?<>[\]{}]+$/;
  if (specialSymbolPattern.test(trimmed) && !/[A-Za-z0-9]/.test(trimmed)) {
    return false;
  }

  // Проверяем, начинается ли с буквы аккорда (A-G, H)
  const chordStartPattern = /^[A-GH][#b]?/i;
  if (chordStartPattern.test(trimmed)) {
    return true;
  }

  // Проверяем наличие типичных аккордовых модификаторов
  const chordModifiers = /^(m|maj|min|dim|aug|sus|add|maj7|m7|dim7|aug7|sus4|sus2|add9|add11|add13)/i;
  if (chordModifiers.test(trimmed)) {
    return true;
  }

  // Если содержит слэш (басовые ноты), это аккорд
  if (trimmed.includes('/')) {
    return true;
  }

  // Если содержит буквы или цифры, считаем аккордом
  if (/[A-Za-z0-9]/.test(trimmed)) {
    return true;
  }

  // По умолчанию - не аккорд (специальный символ)
  return false;
}

/**
 * Разбирает строку на пары аккорд-текст, аналогично методу decompose из оригинального проекта
 *
 * @param line - строка с аккордами в формате [аккорд]
 * @returns объект с массивами аккордов и фраз
 *
 * @example
 * decomposeLine("Го[D]во[E]ри")
 * // { chords: ['', 'D', 'E'], phrases: ['Го', 'во', 'ри'] }
 */
export function decomposeLine(line: string): DecomposedLine {
  // Убираем trailing whitespace
  const trimmed = line.trimEnd();

  // Проверяем наличие отступа
  const hasIndent = /^\s+/.test(line);

  // Разбиваем по аккордам и специальным символам
  // НЕ фильтруем пустые строки, так как они важны для структуры
  const parts = trimmed.split(/(\[.*?\])/g);

  const chords: string[] = [];
  const phrases: string[] = [];
  const specialSymbols: string[] = [];

  // Обрабатываем части: чередуются текст и [аккорд/символ]
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] || '';

    // Если это аккорд/символ в скобках
    if (part.startsWith('[') && part.endsWith(']')) {
      const content = part.slice(1, -1);

      // Определяем, аккорд это или специальный символ
      if (isChordSymbol(content)) {
        chords.push(content);
        specialSymbols.push(''); // Пустая строка для аккорда
      } else {
        // Специальный символ - добавляем в массив специальных символов
        chords.push(''); // Пустой аккорд
        specialSymbols.push(content); // Сохраняем специальный символ
      }

      // Текст после аккорда/символа (может быть пустым)
      const nextPart = parts[i + 1] || '';
      phrases.push(nextPart);
    }
    // Если это текст перед первым аккордом
    else if (i === 0 && part && !part.startsWith('[')) {
      // Добавляем пустой аккорд для текста в начале
      chords.push('');
      specialSymbols.push('');
      phrases.push(part);
    }
  }

  // Если нет аккордов/символов, но есть текст
  if (chords.length === 0 && trimmed) {
    chords.push('');
    specialSymbols.push('');
    phrases.push(trimmed);
  }

  return { chords, phrases, hasIndent, specialSymbols };
}

/**
 * Экранирует HTML-специальные символы и нормализует кавычки
 * Аналогично функции html() из оригинального проекта
 *
 * @param text - текст для экранирования
 * @returns экранированный текст
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '’'); // правильная кавычка (апостроф)
}

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
