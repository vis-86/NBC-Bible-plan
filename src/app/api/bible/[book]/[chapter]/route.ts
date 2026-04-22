import { NextRequest, NextResponse } from 'next/server';
import { getChapterTextByTranslation, getNormalizedBookName, getNormalizedBookNameByTranslation } from '@/lib/bible-data';
import { getSession } from '@/lib/session';
import { getReadingSettings } from '@/lib/directus-data';
import { getTestamentForBook } from '@/lib/bible-testament';
import { resolveSelfHostedTranslationId } from '@/lib/bible-translations';

/**
 * GET /api/bible/[book]/[chapter]
 * Получает текст главы Библии
 * 
 * @param book - название книги (например, "Бытие" или "1 Цар.")
 * @param chapter - номер главы (например, 1)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ book: string; chapter: string }> }
) {
  try {
    const { book, chapter } = await params;
    
    // Декодируем название книги из URL
    const bookName = decodeURIComponent(book);
    const chapterNum = parseInt(chapter, 10);
    
    // Валидация
    if (!bookName || isNaN(chapterNum) || chapterNum < 1) {
      return NextResponse.json(
        { error: 'Invalid book name or chapter number' },
        { status: 400 }
      );
    }
    
    // Нормализуем имя книги (преобразуем сокращения и варианты) по базовому индексу
    const normalizedBookName = getNormalizedBookName(bookName);
    
    if (!normalizedBookName) {
      return NextResponse.json(
        { error: `Book "${bookName}" not found` },
        { status: 404 }
      );
    }

    const testament = getTestamentForBook(normalizedBookName);

    // Выбор перевода: по настройкам пользователя (если есть сессия), иначе по query param, иначе default.
    const queryTranslation = request.nextUrl.searchParams.get('translation');
    const session = await getSession();

    let requestedTranslation: string | null = queryTranslation;
    if (session) {
      const settings = await getReadingSettings(session.directus_id);
      requestedTranslation = testament === 'nt' ? settings?.nt_translation : settings?.ot_translation;
    }

    const translationId = resolveSelfHostedTranslationId(requestedTranslation, testament ?? 'ot', 'rst');

    // Нормализуем имя книги в контексте выбранного перевода (если отдельный индекс/датасет)
    const normalizedBookNameForTranslation =
      getNormalizedBookNameByTranslation(bookName, translationId) ?? normalizedBookName;

    // Получаем текст главы
    const text = getChapterTextByTranslation(normalizedBookNameForTranslation, chapterNum, translationId);
    
    if (!text) {
      return NextResponse.json(
        { error: `Chapter ${chapterNum} not found in "${normalizedBookNameForTranslation}"` },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      book: normalizedBookNameForTranslation,
      chapter: chapterNum,
      text,
      translation: translationId,
      testament
    });
    
  } catch (error) {
    console.error('[Bible API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

