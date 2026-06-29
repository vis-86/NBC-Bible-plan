import { NextRequest, NextResponse } from 'next/server';
import { verifyTelegramInitData } from '@/lib/telegram-server';
import {
  linkTelegramToUser,
  loginToEmail,
  TelegramAlreadyLinkedError,
} from '@/lib/directus-user';
import { createSession, SessionData } from '@/lib/session';
import { TelegramLinkSchema, firstZodError } from '@/lib/validators/auth.schemas';
import { checkRateLimit, clientIp } from '@/lib/rate-limiter';

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[telegram-link]', ...args);
}

/**
 * POST /api/auth/telegram/link
 * Однократная привязка tg-аккаунта к существующему пароль-аккаунту.
 * После привязки mini-app входит без логина/пароля (через /api/auth/telegram).
 * Body: { initData, login, password }
 */
export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    if (!checkRateLimit(`tg-link:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Слишком много попыток. Подождите.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const parsed = TelegramLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
    }
    const { initData, login, password } = parsed.data;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN is not set');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const result = verifyTelegramInitData(initData, botToken);
    if (!result.valid || !result.user) {
      return NextResponse.json({ error: result.error || 'Invalid Telegram data' }, { status: 401 });
    }

    // Проверяем креды пользователя через Directus (получаем токен и id).
    const email = loginToEmail(login.trim());
    const loginRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) {
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
    }
    const { data } = await loginRes.json();
    const accessToken: string | undefined = data?.access_token;

    const meRes = await fetch(`${DIRECTUS_URL}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      return NextResponse.json({ error: 'Не удалось получить данные пользователя' }, { status: 500 });
    }
    const { data: user } = await meRes.json();
    const directusUserId = String(user?.id);

    await linkTelegramToUser(directusUserId, result.user.id);

    // T6: access_token используется только для /users/me выше; в сессии не храним.
    const sessionData: SessionData = {
      directus_id: directusUserId,
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? undefined,
      username: user?.email ?? undefined,
    };

    const response = NextResponse.json({
      success: true,
      user: { directus_id: directusUserId, first_name: sessionData.first_name },
    });
    await createSession(sessionData, response);
    debug('linked tg_id=%s -> user=%s', result.user.id, directusUserId);
    return response;
  } catch (error) {
    if (error instanceof TelegramAlreadyLinkedError) {
      return NextResponse.json(
        { error: 'Этот Telegram уже привязан к другому аккаунту.' },
        { status: 409 }
      );
    }
    console.error('API Auth Telegram Link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
