import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getReadingSettings, saveReadingSettings } from '@/lib/directus-data';

/**
 * GET /api/user/reading-settings
 * Получает настройки чтения текущего пользователя
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Только server-side: сессия уже проверена. Админ-клиент + фильтр по directus_id —
    // иначе 403/ошибки у роли пользователя на коллекции `reading_settings` и сессии без access_token (Telegram).
    const settings = await getReadingSettings(session.directus_id);

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error getting reading settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/user/reading-settings
 * Сохраняет настройки чтения текущего пользователя
 * 
 * Request body:
 * {
 *   "font_size": 20,
 *   "line_height": 1.6,
 *   "text_align": "left",
 *   "theme": "light",
 *   "verse_numbers_visible": true
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await request.json();

    await saveReadingSettings(session.directus_id, settings);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving reading settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


