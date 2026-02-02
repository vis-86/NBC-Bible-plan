import { BIBLE_STRUCTURE } from '@/lib/constants';
import type { Testament } from '@/lib/bible-translations';

const OT_END_BOOK = 'Малахия';
const OT_END_INDEX = BIBLE_STRUCTURE.findIndex(b => b.name === OT_END_BOOK);

/**
 * Определяет Завет по полному русскому названию книги (как в `BIBLE_STRUCTURE`).
 */
export function getTestamentForBook(bookName: string): Testament | null {
  if (!bookName) return null;
  const idx = BIBLE_STRUCTURE.findIndex(b => b.name === bookName);
  if (idx === -1) return null;

  // На всякий случай: если структура поменялась и Малахия не найдена, считаем NT начиная с Матфея.
  if (OT_END_INDEX === -1) {
    const ntStartIdx = BIBLE_STRUCTURE.findIndex(b => b.name === 'От Матфея');
    if (ntStartIdx === -1) return null;
    return idx >= ntStartIdx ? 'nt' : 'ot';
  }

  return idx <= OT_END_INDEX ? 'ot' : 'nt';
}

