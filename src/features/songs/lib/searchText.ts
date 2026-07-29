/**
 * Текст песни и запрос, приведённые к виду, пригодному для поиска.
 *
 * Две отдельные операции, и это важно:
 * - `chordProToPlainText` вырезает разметку ChordPro, но СОХРАНЯЕТ регистр и пунктуацию —
 *   из этого текста строится сниппет в выдаче, читать «о благодать сколь сладок звук»
 *   без заглавных и запятых неприятно;
 * - `normalizeForSearch` уже убивает регистр и пунктуацию и применяется к обеим сторонам
 *   сравнения (и к запросу, и к тексту), поэтому «О, благодать» находится по «о благодать».
 *
 * Pure TS — без React и браузерных API.
 */
import { isComment, isCommentBox, isCommentItalic, isDirective, parseDirective } from './chordProUtils';

/** Инлайновый аккорд или тактовая черта: `[D]`, `[Em7/G]`, `[|]`. */
const CHORD_TOKEN = /\[[^\]]*\]/g;

/**
 * Убирает разметку ChordPro, оставляя только текст песни.
 *
 * Аккорд вырезается БЕЗ вставки пробела: `бла[A]год[E]ать` → `благодать`, иначе слово
 * распалось бы на три токена и поиск по нему был бы невозможен.
 */
export function chordProToPlainText(content: string): string {
  if (!content) return '';

  const lines: string[] = [];

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (isDirective(line)) {
      const directive = parseDirective(line);
      // Комментарии («Куплет 1», «Проигрыш») — это видимый текст листа, остальные
      // директивы (метаданные, границы припева) к содержанию песни не относятся.
      const isCommentDirective =
        directive !== null &&
        (isComment(directive.type) || isCommentItalic(directive.type) || isCommentBox(directive.type));
      if (isCommentDirective && directive.value) lines.push(directive.value);
      continue;
    }

    const text = line.replace(CHORD_TOKEN, '').replace(/\|/g, '').replace(/\s+/g, ' ').trim();
    // Строка из одних аккордов после вырезания пуста — в тексте песни ей делать нечего.
    if (!/[\p{L}\p{N}]/u.test(text)) continue;

    lines.push(text);
  }

  return lines.join('\n');
}

/**
 * Приводит строку к форме сравнения: нижний регистр, без диакритики, без пунктуации.
 *
 * NFD + снятие комбинирующих знаков заодно уравнивает `ё`/`е` и `й`/`и` — небольшая
 * пере-нормализация, но она работает одинаково с обеих сторон сравнения и на практике
 * только помогает («всё» находится по «все»).
 */
export function normalizeForSearch(s: string): string {
  if (!s) return '';

  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Запрос → список нормализованных слов. Пустые токены отброшены. */
export function toSearchTokens(query: string): string[] {
  const normalized = normalizeForSearch(query);
  return normalized ? normalized.split(' ') : [];
}
