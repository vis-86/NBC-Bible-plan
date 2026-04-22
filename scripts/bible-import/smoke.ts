#!/usr/bin/env npx tsx
/**
 * Smoke: load generated translation and print chapter length (run from repo root).
 * Example: npx tsx scripts/bible-import/smoke.ts kassian2019 Филимону 1
 */
import { getChapterTextByTranslation } from '../../src/lib/bible-data';

const [, , translationId, book, chapter] = process.argv;
if (!translationId || !book || !chapter) {
  console.error('Usage: npx tsx scripts/bible-import/smoke.ts <translationId> <bookName> <chapterNum>');
  process.exit(1);
}

const ch = parseInt(chapter, 10);
const text = getChapterTextByTranslation(book, ch, translationId);
if (!text || text.length < 10) {
  console.error(`[smoke] FAIL translation=${translationId} book=${book} chapter=${chapter} len=${text?.length ?? 0}`);
  process.exit(1);
}

console.log(`[smoke] INFO translation=${translationId} book=${book} chapter=${chapter} len=${text.length}`);
console.log(text.slice(0, 200) + (text.length > 200 ? '…' : ''));
