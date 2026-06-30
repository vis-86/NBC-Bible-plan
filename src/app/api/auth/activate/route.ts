import { NextRequest, NextResponse } from 'next/server';
import { createSession, SessionData } from '@/lib/session';
import { findValidInvite, consumeInvite } from '@/lib/invite';
import { createLocalUser, setUserPassword, LoginTakenError } from '@/lib/directus-user';
import { getDirectusAdminClient } from '@/lib/directus';
import { readUsers } from '@directus/sdk';
import { ActivateSchema, firstZodError } from '@/lib/validators/auth.schemas';
import { checkRateLimit, clientIp } from '@/lib/rate-limiter';

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[activate]', ...args);
}

/**
 * POST /api/auth/activate
 * Активация по invite-токену (создание аккаунта) ИЛИ сброс пароля (reset-токен).
 * Body: { token, login?, displayName?, password }
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!checkRateLimit(`activate:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Слишком много попыток. Подождите час.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const parsed = ActivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }
  const { token, login, displayName, password } = parsed.data;

  const invite = await findValidInvite(token);
  if (!invite) {
    return NextResponse.json(
      { error: 'Ссылка недействительна или истекла. Обратитесь в поддержку.' },
      { status: 400 }
    );
  }

  try {
    let directusUserId: string;

    if (invite.kind === 'activate') {
      if (!login) {
        return NextResponse.json({ error: 'Укажите логин' }, { status: 400 });
      }
      directusUserId = await createLocalUser(login, password, displayName);
      debug('account created', directusUserId, login);
      // activate: помечаем invite использованным + привязываем созданного юзера
      await consumeInvite(invite.id, directusUserId);
    } else {
      // reset
      if (!invite.user) {
        return NextResponse.json({ error: 'Некорректный токен сброса' }, { status: 400 });
      }
      await setUserPassword(invite.user, password);
      directusUserId = invite.user;
      debug('password reset for', directusUserId);
      await consumeInvite(invite.id);
    }

    // T6: сессия не хранит Directus access_token — данные читаются admin-клиентом по directus_id.
    const admin = getDirectusAdminClient();
    const users = await admin.request(
      readUsers({ filter: { id: { _eq: directusUserId } }, limit: 1, fields: ['first_name', 'last_name'] })
    );
    const user = (users[0] as { first_name?: string; last_name?: string }) ?? {};

    const sessionData: SessionData = {
      directus_id: directusUserId,
      first_name: user.first_name ?? displayName ?? '',
      last_name: user.last_name ?? undefined,
    };

    const response = NextResponse.json({
      success: true,
      user: { directus_id: directusUserId, first_name: sessionData.first_name },
    });
    await createSession(sessionData, response);
    return response;
  } catch (error) {
    if (error instanceof LoginTakenError) {
      return NextResponse.json({ error: 'Этот логин уже занят. Выберите другой.' }, { status: 409 });
    }
    console.error('API Auth Activate error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
