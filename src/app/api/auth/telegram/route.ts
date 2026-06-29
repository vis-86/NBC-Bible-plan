import { NextRequest, NextResponse } from 'next/server';
import { verifyTelegramInitData } from '@/lib/telegram-server';
import { getUserByTelegramId } from '@/lib/directus-user';
import { createSession } from '@/lib/session';
import { getDirectusAdminClient } from '@/lib/directus';
import { readUsers } from '@directus/sdk';

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[telegram]', ...args);
}

/**
 * POST /api/auth/telegram
 * Mini-app вход. Аккаунты здесь НЕ создаются (см. RESEARCH, Вариант 1) —
 * только авто-вход для уже привязанного tg_id.
 *
 * КОНТРАКТ:
 *  - tg_id привязан    → 200 { success: true, linked: true } + сессия.
 *  - tg_id НЕ привязан  → 200 { linked: false } БЕЗ сессии. Клиент ДОЛЖЕН ветвиться
 *    по `linked`, а не по res.ok (иначе redirect-loop на /dashboard).
 */
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
    const directusUserId = await getUserByTelegramId(telegramUser.id);

    if (!directusUserId) {
      // НЕ создаём аккаунт — просим привязать существующий.
      debug('tg_id=%s linked=false', telegramUser.id);
      return NextResponse.json({ linked: false });
    }

    // Берём актуальное имя из Directus (а не из tg-профиля).
    const admin = getDirectusAdminClient();
    const users = await admin.request(
      readUsers({ filter: { id: { _eq: directusUserId } }, limit: 1, fields: ['first_name', 'last_name'] })
    );
    const user = (users[0] as { first_name?: string; last_name?: string }) ?? {};

    const response = NextResponse.json({
      success: true,
      linked: true,
      user: { directus_id: directusUserId, first_name: user.first_name ?? telegramUser.first_name },
    });
    await createSession(
      {
        directus_id: directusUserId,
        first_name: user.first_name ?? telegramUser.first_name,
        last_name: user.last_name ?? telegramUser.last_name,
        username: telegramUser.username,
      },
      response
    );
    debug('tg_id=%s linked=true user=%s', telegramUser.id, directusUserId);
    return response;
  } catch (error) {
    console.error('API Auth Telegram error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
