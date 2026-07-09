/**
 * Порт группы bible из src/app/api/bible/* (1:1 по поведению).
 * `/bible/[book]/[chapter]` уважает сессию: если есть — перевод берём из
 * reading-settings пользователя, иначе — из query `?translation=`.
 */
import { Hono } from 'hono';
import {
  getAllBooks,
  getChapterTextByTranslation,
  getNormalizedBookName,
  getNormalizedBookNameByTranslation,
  loadBibleIndexByTranslation,
  loadBookDataByTranslation,
} from '../../../src/lib/bible-data';
import { getTestamentForBook } from '../../../src/lib/bible-testament';
import { BIBLE_TRANSLATIONS, isBibleTranslationId, resolveSelfHostedTranslationId } from '../../../src/lib/bible-translations';
import { getReadingSettings } from '../../../src/lib/directus-data';
import { logger } from '../logger';
import { getSession } from '../session';

export const bibleRoutes = new Hono();

/**
 * GET /bible/books
 */
bibleRoutes.get('/books', (c) => {
  try {
    const books = getAllBooks();
    return c.json({ books });
  } catch (error) {
    logger.error('[Bible Books API] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /bible/download/:translation — bulk-выгрузка перевода для офлайн-загрузки.
 * Не гейтится сессией.
 */
bibleRoutes.get('/download/:translation', (c) => {
  try {
    const translation = c.req.param('translation');

    if (!isBibleTranslationId(translation)) {
      return c.json({ error: `Unknown translation "${translation}"` }, 404);
    }

    const descriptor = BIBLE_TRANSLATIONS[translation];
    if (!descriptor.selfHostedAllowed) {
      return c.json({ error: `Translation "${translation}" is not available for bulk download` }, 403);
    }

    const index = loadBibleIndexByTranslation(translation);
    const books: Record<string, { name: string; chapters: Record<string, string> }> = {};

    for (const bookName of Object.keys(index)) {
      const bookData = loadBookDataByTranslation(bookName, translation);
      if (bookData) books[bookName] = bookData;
    }

    logger.info(`bible download: translation=${translation} books=${Object.keys(books).length}`);
    return c.json({ translation, books });
  } catch (error) {
    logger.error('[Bible Download API] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /bible/:book/:chapter?translation=
 */
bibleRoutes.get('/:book/:chapter', async (c) => {
  try {
    const book = c.req.param('book');
    const chapter = c.req.param('chapter');

    const bookName = decodeURIComponent(book);
    const chapterNum = parseInt(chapter, 10);

    if (!bookName || isNaN(chapterNum) || chapterNum < 1) {
      return c.json({ error: 'Invalid book name or chapter number' }, 400);
    }

    const normalizedBookName = getNormalizedBookName(bookName);
    if (!normalizedBookName) {
      return c.json({ error: `Book "${bookName}" not found` }, 404);
    }

    const testament = getTestamentForBook(normalizedBookName);

    const queryTranslation = c.req.query('translation') ?? null;
    const session = await getSession(c);

    let requestedTranslation: string | null = queryTranslation;
    if (session) {
      const settings = await getReadingSettings(session.directus_id);
      requestedTranslation = testament === 'nt' ? settings?.nt_translation : settings?.ot_translation;
    }

    const translationId = resolveSelfHostedTranslationId(requestedTranslation, testament ?? 'ot', 'rst');

    const normalizedBookNameForTranslation =
      getNormalizedBookNameByTranslation(bookName, translationId) ?? normalizedBookName;

    const text = getChapterTextByTranslation(normalizedBookNameForTranslation, chapterNum, translationId);
    if (!text) {
      return c.json({ error: `Chapter ${chapterNum} not found in "${normalizedBookNameForTranslation}"` }, 404);
    }

    logger.debug(`bible: ${normalizedBookNameForTranslation} ${chapterNum} translation=${translationId}`);
    return c.json({
      book: normalizedBookNameForTranslation,
      chapter: chapterNum,
      text,
      translation: translationId,
      testament,
    });
  } catch (error) {
    logger.error('[Bible API] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
