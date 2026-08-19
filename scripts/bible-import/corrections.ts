/**
 * Вычитка дефектов исходного модуля.
 *
 * Модули BibleQuote собираются энтузиастами из OCR и содержат опечатки («Выл человек»,
 * «Вое ли», «Атак как»). Править сгенерированный JSON руками нельзя: следующий импорт
 * молча вернёт дефекты. Поэтому правки живут декларативным файлом рядом с конвейером и
 * применяются после разбора HTML.
 *
 * Каждая правка ОБЯЗАНА совпасть ровно один раз. Не совпала — источник изменился, и
 * импорт сообщает об этом, а не применяет правку наугад.
 */
import fs from 'fs';
import path from 'path';

export interface Correction {
  book: string;
  chapter: string;
  find: string;
  replace: string;
  note?: string;
}

export interface CorrectionsFile {
  translationId: string;
  note?: string;
  corrections: Correction[];
}

export interface AppliedCorrections {
  applied: number;
  /** Правки, не совпавшие ровно один раз — дефект уже исправлен в источнике или текст изменился. */
  problems: string[];
}

const CORRECTIONS_DIR = path.join(__dirname, 'corrections');

/** Читает файл правок перевода. Нет файла — правок нет, это норма. */
export function loadCorrections(translationId: string): Correction[] {
  const file = path.join(CORRECTIONS_DIR, `${translationId}.json`);
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as CorrectionsFile;
  return parsed.corrections ?? [];
}

/**
 * Применяет правки к главам ОДНОЙ книги (мутирует переданный объект).
 * `chapters` — карта «номер главы → текст», как её отдаёт парсер HTML.
 */
export function applyCorrections(
  book: string,
  chapters: Record<string, string>,
  corrections: Correction[]
): AppliedCorrections {
  const result: AppliedCorrections = { applied: 0, problems: [] };

  for (const correction of corrections) {
    if (correction.book !== book) continue;

    const text = chapters[correction.chapter];
    if (text === undefined) {
      result.problems.push(`${book} ${correction.chapter}: главы нет — правка "${correction.find}" не применена`);
      continue;
    }

    const occurrences = text.split(correction.find).length - 1;
    if (occurrences !== 1) {
      result.problems.push(
        `${book} ${correction.chapter}: "${correction.find}" встречается ${occurrences} раз(а), ожидалась ровно 1 — правка не применена`
      );
      continue;
    }

    chapters[correction.chapter] = text.replace(correction.find, correction.replace);
    result.applied += 1;
  }

  return result;
}
