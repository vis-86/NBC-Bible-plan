import { NextRequest, NextResponse } from 'next/server';
import { createSession, SessionData } from '@/lib/session';
import { createLocalUser, LoginTakenError } from '@/lib/directus-user';
import { getDirectusAdminClient } from '@/lib/directus';
import { readUsers } from '@directus/sdk';
import { RegisterSchema, firstZodError } from '@/lib/validators/auth.schemas';
import { isRegistrationOpen, isChurchCodeRequired, verifyChurchCode } from '@/lib/register-access';
import { checkRateLimit, clientIp } from '@/lib/rate-limiter';

// crypto.timingSafeEqual (register-access) требует Node.js runtime, не edge.
export const runtime = 'nodejs';

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[register]', ...args);
}

/**
 * POST /api/auth/register
 * Самостоятельная регистрация: login + password (+ churchCode, если код требуется).
 * Параллельна invite-модели (/api/auth/activate её не трогает).
 *
 * Барьеры по порядку: rate-limit → 503(выключено) → zod → 403(код, только если требуется) → 409(дубль).
 * Код церкви обязателен лишь когда задан секрет REGISTER_CHURCH_CODE; иначе (режим
 * REGISTER_OPEN_NO_CODE) шаг 403 пропускается. Логи без PII: не логируем пароль и код церкви.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  // Главный барьер против перебора общего кода церкви: 5 попыток в час на IP.
  if (!checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    debug('rate limited', ip);
    return NextResponse.json({ error: 'Слишком много попыток. Подождите час.' }, { status: 429 });
  }

  // Регистрация выключена, если секрет не задан — 503 (источник истины — сервер).
  if (!isRegistrationOpen()) {
    debug('registration closed');
    return NextResponse.json({ error: 'Регистрация сейчас недоступна.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }
  const { login, displayName, password, churchCode } = parsed.data;

  // Код церкви проверяем только когда он требуется (задан секрет REGISTER_CHURCH_CODE).
  // В режиме «без кода» (REGISTER_OPEN_NO_CODE) присланный churchCode игнорируется.
  if (isChurchCodeRequired()) {
    if (!verifyChurchCode(churchCode ?? '')) {
      debug('invalid church code attempt', ip);
      return NextResponse.json({ error: 'Неверный код церкви' }, { status: 403 });
    }
    debug('church code check passed');
  } else {
    debug('church code not required, skipping check');
  }

  try {
    const directusUserId = await createLocalUser(login, password, displayName);
    debug('account registered', directusUserId, login);

    // Сессия не хранит Directus access_token — данные читаются admin-клиентом по directus_id.
    const admin = getDirectusAdminClient();
    const users = await admin.request(
      readUsers({ filter: { id: { _eq: directusUserId } }, limit: 1, fields: ['first_name', 'last_name'] })
    );
    const user = (users[0] as { first_name?: string; last_name?: string }) ?? {};

    const sessionData: SessionData = {
      directus_id: directusUserId,
      first_name: user.first_name ?? displayName ?? login,
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
    console.error('[register] error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
