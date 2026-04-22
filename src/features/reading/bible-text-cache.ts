import { BibleReference } from '@/types';
import { bibleApi } from '@/shared/services/api/endpoints';
import { getTestamentForBook } from '@/lib/bible-testament';

function cacheKey(book: string, chapter: number, translationId: string): string {
  return `${translationId}|${book}|${chapter}`;
}

const cache = new Map<string, string>();

/** Какой перевод из настроек соответствует книге (как на сервере в `/api/bible/...`). */
export function translationIdForBook(
  book: string,
  otTranslation: string,
  ntTranslation: string
): string {
  return getTestamentForBook(book) === 'nt' ? ntTranslation : otTranslation;
}

export function getCachedText(
  book: string,
  chapter: number,
  translationId: string
): string | undefined {
  return cache.get(cacheKey(book, chapter, translationId));
}

export function setCachedText(
  book: string,
  chapter: number,
  translationId: string,
  text: string
): void {
  cache.set(cacheKey(book, chapter, translationId), text);
}

/**
 * Preloads Bible chapter texts in the background and stores them in the cache.
 * Does not throw; errors are logged.
 */
export async function preloadChapters(
  refs: BibleReference[],
  translations: { ot: string; nt: string } = { ot: 'rst', nt: 'rst' }
): Promise<void> {
  const promises = refs.map(async (ref) => {
    const translationId = translationIdForBook(ref.book, translations.ot, translations.nt);
    const key = cacheKey(ref.book, ref.chapter, translationId);
    if (cache.has(key)) return;

    try {
      const response = await bibleApi.getText(ref.book, ref.chapter);
      const text = response.text ?? '';
      cache.set(key, text);
    } catch (err) {
      console.warn('[bible-text-cache] Preload failed:', ref.book, ref.chapter, err);
    }
  });

  await Promise.all(promises);
}
