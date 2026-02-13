import { BibleReference } from '@/types';
import { bibleApi } from '@/shared/services/api/endpoints';

function cacheKey(book: string, chapter: number): string {
  return `${book}_${chapter}`;
}

const cache = new Map<string, string>();

export function getCachedText(book: string, chapter: number): string | undefined {
  return cache.get(cacheKey(book, chapter));
}

export function setCachedText(book: string, chapter: number, text: string): void {
  cache.set(cacheKey(book, chapter), text);
}

/**
 * Preloads Bible chapter texts in the background and stores them in the cache.
 * Does not throw; errors are logged.
 */
export async function preloadChapters(refs: BibleReference[]): Promise<void> {
  const promises = refs.map(async (ref) => {
    const key = cacheKey(ref.book, ref.chapter);
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
