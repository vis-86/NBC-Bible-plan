import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getAppSettings, saveAppSettings } from '@/lib/directus-data';

/**
 * GET /api/user/app-settings
 * Получает настройки приложения текущего пользователя (тема UI и т.д.)
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await getAppSettings(session.directus_id, session.access_token);

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error getting app settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/user/app-settings
 * Сохраняет настройки приложения текущего пользователя
 *
 * Request body:
 * { "theme": "light" | "dark" | "system" }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const theme = body.theme;

    if (theme !== 'light' && theme !== 'dark' && theme !== 'system') {
      return NextResponse.json(
        { error: 'Invalid theme. Use "light", "dark", or "system".' },
        { status: 400 }
      );
    }

    await saveAppSettings(session.directus_id, { theme }, session.access_token);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving app settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
