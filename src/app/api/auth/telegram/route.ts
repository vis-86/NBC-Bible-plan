import { NextRequest, NextResponse } from 'next/server';
import { verifyTelegramInitData } from '@/lib/telegram-server';
import { findOrCreateUser } from '@/lib/directus-user';
import { createSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { initData } = await request.json();

    if (!initData) {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN is not set in environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const result = verifyTelegramInitData(initData, botToken);

    if (!result.valid || !result.user) {
      return NextResponse.json({ error: result.error || 'Invalid user data' }, { status: 401 });
    }

    const telegramUser = result.user;

    // Находим или создаем пользователя в Directus
    const directusUserId = await findOrCreateUser(telegramUser);

    // Создаем Next.js сессию
    const sessionData = {
      telegram_id: telegramUser.id,
      directus_id: directusUserId,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name,
      username: telegramUser.username,
    };

    const response = NextResponse.json({ 
      success: true, 
      user: {
        id: telegramUser.id,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
        username: telegramUser.username,
        directus_id: directusUserId
      }
    });

    createSession(sessionData, response);

    return response;
  } catch (error) {
    console.error('API Auth Telegram error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
