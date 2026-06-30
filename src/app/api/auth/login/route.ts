import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/session';
import { loginToEmail } from '@/lib/directus-user';
import { LoginSchema, firstZodError } from '@/lib/validators/auth.schemas';
import { checkRateLimit, clientIp } from '@/lib/rate-limiter';

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[login]', ...args);
}

/**
 * POST /api/auth/login
 * Вход по логину (handle) и паролю. Логин нормализуется в `{login}@local.baptistnn.ru`;
 * email с явным доменом проходит как есть (backward-compat для Directus email-аккаунтов).
 */
export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Слишком много попыток. Подождите.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
    }
    const { login, password } = parsed.data;
    const email = loginToEmail(login.trim());
    debug('attempt handle=%s -> %s', login, email);

    const loginRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!loginRes.ok) {
      const errData = await loginRes.json().catch(() => ({}));
      const message =
        errData?.errors?.[0]?.message ||
        (loginRes.status === 401 ? 'Неверный логин или пароль' : 'Ошибка входа');
      return NextResponse.json({ error: message }, { status: loginRes.status });
    }

    const { data } = await loginRes.json();
    const accessToken = data?.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Некорректный ответ от сервера' },
        { status: 500 }
      );
    }

    const meRes = await fetch(`${DIRECTUS_URL}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!meRes.ok) {
      return NextResponse.json(
        { error: 'Не удалось получить данные пользователя' },
        { status: 500 }
      );
    }

    const { data: user } = await meRes.json();
    const directusId = user?.id;
    if (!directusId) {
      return NextResponse.json(
        { error: 'Некорректные данные пользователя' },
        { status: 500 }
      );
    }

    // T6: access_token используется только для запроса /users/me выше; в сессии не храним.
    const sessionData = {
      directus_id: String(directusId),
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? undefined,
      username: user?.email ?? undefined,
    };

    const response = NextResponse.json({
      success: true,
      user: {
        directus_id: sessionData.directus_id,
        first_name: sessionData.first_name,
        last_name: sessionData.last_name,
        username: sessionData.username,
      },
    });

    await createSession(sessionData, response);

    return response;
  } catch (error) {
    console.error('API Auth Login error:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
