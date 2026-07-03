import { NextResponse } from 'next/server';
import { loadBibleIndexByTranslation, loadBookDataByTranslation } from '@/lib/bible-data';
import { isBibleTranslationId, BIBLE_TRANSLATIONS } from '@/lib/bible-translations';

/**
 * GET /api/bible/download/[translation]
 *
 * Bulk-выгрузка целого перевода Писания одним запросом — для офлайн-загрузки
 * (Task 22/27, .ai-factory/plans/feature-offline-pwa.md). Агрегирует index.json +
 * все books/*.json перевода в один JSON-ответ (~6 MB для nrt2019, ~1.4 MB для
 * kassian2019 — только НЗ). Клиент отслеживает прогресс по Content-Length через
 * reader стрима ответа.
 *
 * Не гейтится сессией — как и остальные `/api/bible/*` роуты, текст Писания не
 * персонализирован (в отличие от `/api/bible/[book]/[chapter]`, где сессия влияет
 * только на выбор перевода по умолчанию).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ translation: string }> }
) {
  try {
    const { translation } = await params;

    if (!isBibleTranslationId(translation)) {
      return NextResponse.json({ error: `Unknown translation "${translation}"` }, { status: 404 });
    }

    const descriptor = BIBLE_TRANSLATIONS[translation];
    if (!descriptor.selfHostedAllowed) {
      return NextResponse.json(
        { error: `Translation "${translation}" is not available for bulk download` },
        { status: 403 }
      );
    }

    const index = loadBibleIndexByTranslation(translation);
    const books: Record<string, { name: string; chapters: Record<string, string> }> = {};

    for (const bookName of Object.keys(index)) {
      const bookData = loadBookDataByTranslation(bookName, translation);
      if (bookData) books[bookName] = bookData;
    }

    return NextResponse.json({
      translation,
      books,
    });
  } catch (error) {
    console.error('[Bible Download API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
