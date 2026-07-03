import { BibleReference } from '@/types';
import { bibleApi } from '@/shared/services/api/endpoints';
import { getTestamentForBook } from '@/lib/bible-testament';
import { getDB } from '@/shared/offline/db';

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[bible-text-cache]', ...args);
}

function cacheKey(book: string, chapter: number, translationId: string): string {
  return `${translationId}|${book}|${chapter}`;
}

const cache = new Map<string, string>();

/**
 * IDB-фолбэк чтения главы, когда сеть недоступна и memory-кеш пуст (Task 22).
 * Ключ — `(translation, book, chapter)`, как в memory-кеше выше.
 */
export async function getPersistedText(
  book: string,
  chapter: number,
  translationId: string
): Promise<string | undefined> {
  try {
    const db = await getDB();
    const record = await db.get('bibleChapters', cacheKey(book, chapter, translationId));
    return record?.text;
  } catch (err) {
    debug('IDB read failed', book, chapter, translationId, err);
    return undefined;
  }
}

/**
 * Пишет текст главы в IDB. Ключуется по `translation` из СЕТЕВОГО ОТВЕТА, а не по
 * клиентским настройкам — сессия может резолвить перевод иначе, чем ожидает вызывающий
 * код (см. .ai-factory/plans/feature-offline-pwa.md).
 */
export async function persistText(
  translationId: string,
  book: string,
  chapter: number,
  text: string
): Promise<void> {
  try {
    const db = await getDB();
    await db.put('bibleChapters', {
      key: cacheKey(book, chapter, translationId),
      translationId,
      book,
      chapter,
      text,
      updatedAt: Date.now(),
    });
  } catch (err) {
    debug('IDB write failed', book, chapter, translationId, err);
  }
}

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
