import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/session';

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';

/**
 * POST /api/auth/login
 * Авторизация по email и паролю: проверка в Directus, создание сессии с directus_id
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Укажите email и пароль' },
        { status: 400 }
      );
    }

    const loginRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!loginRes.ok) {
      const errData = await loginRes.json().catch(() => ({}));
      const message =
        errData?.errors?.[0]?.message ||
        (loginRes.status === 401 ? 'Неверный email или пароль' : 'Ошибка входа');
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

    const sessionData = {
      directus_id: String(directusId),
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? undefined,
      username: user?.email ?? undefined,
      access_token: accessToken,
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

    createSession(sessionData, response);

    return response;
  } catch (error) {
    console.error('API Auth Login error:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
