/**
 * Порт auth-группы из src/app/api/auth/* (1:1 по поведению).
 * Бизнес-логика — в src/lib/* (импортируется, не копируется).
 *
 * КОНТРАКТЫ (не ломать):
 *  - POST /auth/telegram при непривязанном tg_id → 200 { linked: false } БЕЗ сессии.
 *  - GET /auth/session — при изменившемся профиле re-seal cookie в ответе.
 *  - Rate limits: login 10/15min, register 5/h, activate 10/h, tg-link 10/15min.
 */
import { Hono } from 'hono';
import { readUsers } from '@directus/sdk';
import { getDirectusAdminClient } from '../../../src/lib/directus';
import {
  createLocalUser,
  getUserByTelegramId,
  linkTelegramToUser,
  LoginTakenError,
  loginToEmail,
  setUserPassword,
  TelegramAlreadyLinkedError,
} from '../../../src/lib/directus-user';
import { consumeInvite, createInvite, findValidInvite } from '../../../src/lib/invite';
import { checkRateLimit, clientIp } from '../../../src/lib/rate-limiter';
import {
  isChurchCodeRequired,
  isRegistrationOpen,
  verifyChurchCode,
} from '../../../src/lib/register-access';
import { verifyTelegramInitData } from '../../../src/lib/telegram-server';
import {
  ActivateSchema,
  firstZodError,
  InviteCreateSchema,
  LoginSchema,
  RegisterSchema,
  TelegramLinkSchema,
} from '../../../src/lib/validators/auth.schemas';
import type { SessionData } from '../../../src/lib/session-core';
import { logger } from '../logger';
import { createSession, deleteSession, getSession } from '../session';

function directusUrl(): string {
  return process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
}

async function readProfileByAdmin(
  directusId: string
): Promise<{ first_name?: string | null; last_name?: string | null; email?: string | null } | undefined> {
  const admin = getDirectusAdminClient();
  const users = await admin.request(
    readUsers({
      filter: { id: { _eq: directusId } },
      limit: 1,
      fields: ['first_name', 'last_name', 'email'],
    })
  );
  return users[0] as
    | { first_name?: string | null; last_name?: string | null; email?: string | null }
    | undefined;
}

export const authRoutes = new Hono();

/**
 * POST /auth/login — вход по логину (handle) и паролю.
 */
authRoutes.post('/login', async (c) => {
  try {
    const ip = clientIp(c.req.raw);
    if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
      logger.warn(`rate limit: login ip=${ip}`);
      return c.json({ error: 'Слишком много попыток. Подождите.' }, 429);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: firstZodError(parsed.error) }, 400);
    }
    const { login, password } = parsed.data;
    const email = loginToEmail(login.trim());
    logger.debug(`login attempt handle=${login}`);

    const loginRes = await fetch(`${directusUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!loginRes.ok) {
      const errData = (await loginRes.json().catch(() => ({}))) as {
        errors?: { message?: string }[];
      };
      const message =
        errData?.errors?.[0]?.message ||
        (loginRes.status === 401 ? 'Неверный логин или пароль' : 'Ошибка входа');
      return c.json({ error: message }, loginRes.status as 401);
    }

    const { data } = (await loginRes.json()) as { data?: { access_token?: string } };
    const accessToken = data?.access_token;
    if (!accessToken) {
      return c.json({ error: 'Некорректный ответ от сервера' }, 500);
    }

    const meRes = await fetch(`${directusUrl()}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      return c.json({ error: 'Не удалось получить данные пользователя' }, 500);
    }

    const { data: user } = (await meRes.json()) as {
      data?: { id?: string | number; email?: string; first_name?: string; last_name?: string };
    };
    const directusId = user?.id;
    if (!directusId) {
      return c.json({ error: 'Некорректные данные пользователя' }, 500);
    }

    // Профиль читаем admin-клиентом по id, а НЕ из /users/me: роль «Чтец»
    // (app-access policy $CURRENT_USER) отдаёт через /users/me только `id`.
    let profile: { first_name?: string | null; last_name?: string | null; email?: string | null } =
      user ?? {};
    try {
      profile = (await readProfileByAdmin(String(directusId))) ?? profile;
      logger.debug(`login: admin profile fetched for ${directusId}`);
    } catch (e) {
      // Не роняем логин из-за профиля: имя догрузится при следующем чтении сессии.
      logger.error(`login: admin profile fetch failed for ${directusId}`, e);
    }

    const sessionData: SessionData = {
      directus_id: String(directusId),
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? undefined,
      username: profile.email ?? user?.email ?? undefined,
    };

    await createSession(c, sessionData);
    logger.debug(`login ok for ${sessionData.directus_id}`);
    return c.json({
      success: true,
      user: {
        directus_id: sessionData.directus_id,
        first_name: sessionData.first_name,
        last_name: sessionData.last_name,
        username: sessionData.username,
      },
    });
  } catch (error) {
    logger.error('login error:', error);
    return c.json({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

/**
 * POST /auth/logout
 */
authRoutes.post('/logout', (c) => {
  deleteSession(c);
  logger.debug('logout');
  return c.json({ success: true });
});

/**
 * GET /auth/session — текущая сессия; профиль освежается admin-клиентом,
 * cookie пере-запечатывается при расхождении.
 */
authRoutes.get('/session', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) {
      return c.json({ user: null }, 200);
    }

    let fresh = session;
    try {
      const profile = await readProfileByAdmin(session.directus_id);
      if (profile) {
        fresh = {
          ...session,
          first_name: profile.first_name ?? '',
          last_name: profile.last_name ?? undefined,
          username: profile.email ?? session.username,
        };
      }
    } catch (error) {
      // Directus недоступен — не роняем сессию, отдаём данные из cookie.
      logger.error(`session profile refresh failed for ${session.directus_id}`, error);
    }

    const changed =
      fresh.first_name !== session.first_name ||
      fresh.last_name !== session.last_name ||
      fresh.username !== session.username;
    if (changed) {
      await createSession(c, fresh);
      logger.debug(`session re-sealed for ${session.directus_id}`);
    }

    return c.json({
      user: {
        directus_id: fresh.directus_id,
        first_name: fresh.first_name,
        last_name: fresh.last_name,
        username: fresh.username,
      },
    });
  } catch (error) {
    logger.error('session error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /auth/register — самостоятельная регистрация.
 * Барьеры по порядку: rate-limit → 503(выключено) → zod → 403(код) → 409(дубль).
 */
authRoutes.post('/register', async (c) => {
  const ip = clientIp(c.req.raw);
  if (!checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    logger.warn(`rate limit: register ip=${ip}`);
    return c.json({ error: 'Слишком много попыток. Подождите час.' }, 429);
  }

  if (!isRegistrationOpen()) {
    logger.debug('register: registration closed');
    return c.json({ error: 'Регистрация сейчас недоступна.' }, 503);
  }

  const body = await c.req.json().catch(() => null);
  if (body === null) {
    return c.json({ error: 'Некорректный запрос' }, 400);
  }
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: firstZodError(parsed.error) }, 400);
  }
  const { login, displayName, password, churchCode } = parsed.data;

  if (isChurchCodeRequired()) {
    if (!verifyChurchCode(churchCode ?? '')) {
      logger.warn(`register: invalid church code attempt ip=${ip}`);
      return c.json({ error: 'Неверный код церкви' }, 403);
    }
  }

  try {
    const directusUserId = await createLocalUser(login, password, displayName);
    logger.debug(`register: account created ${directusUserId} login=${login}`);

    let user: { first_name?: string | null; last_name?: string | null } = {};
    user = (await readProfileByAdmin(directusUserId)) ?? {};

    const sessionData: SessionData = {
      directus_id: directusUserId,
      first_name: user.first_name ?? displayName ?? login,
      last_name: user.last_name ?? undefined,
    };

    await createSession(c, sessionData);
    return c.json({
      success: true,
      user: { directus_id: directusUserId, first_name: sessionData.first_name },
    });
  } catch (error) {
    if (error instanceof LoginTakenError) {
      return c.json({ error: 'Этот логин уже занят. Выберите другой.' }, 409);
    }
    logger.error('register error:', error);
    return c.json({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

/**
 * POST /auth/activate — активация по invite-токену или сброс пароля (reset).
 */
authRoutes.post('/activate', async (c) => {
  const ip = clientIp(c.req.raw);
  if (!checkRateLimit(`activate:${ip}`, 10, 60 * 60 * 1000)) {
    logger.warn(`rate limit: activate ip=${ip}`);
    return c.json({ error: 'Слишком много попыток. Подождите час.' }, 429);
  }

  const body = await c.req.json().catch(() => null);
  if (body === null) {
    return c.json({ error: 'Некорректный запрос' }, 400);
  }
  const parsed = ActivateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: firstZodError(parsed.error) }, 400);
  }
  const { token, login, displayName, password } = parsed.data;

  const invite = await findValidInvite(token);
  if (!invite) {
    return c.json(
      { error: 'Ссылка недействительна или истекла. Обратитесь в поддержку.' },
      400
    );
  }

  try {
    let directusUserId: string;

    if (invite.kind === 'activate') {
      if (!login) {
        return c.json({ error: 'Укажите логин' }, 400);
      }
      directusUserId = await createLocalUser(login, password, displayName);
      logger.debug(`activate: account created ${directusUserId} login=${login}`);
      await consumeInvite(invite.id, directusUserId);
    } else {
      if (!invite.user) {
        return c.json({ error: 'Некорректный токен сброса' }, 400);
      }
      await setUserPassword(invite.user, password);
      directusUserId = invite.user;
      logger.debug(`activate: password reset for ${directusUserId}`);
      await consumeInvite(invite.id);
    }

    const user = (await readProfileByAdmin(directusUserId)) ?? {};

    const sessionData: SessionData = {
      directus_id: directusUserId,
      first_name: user.first_name ?? displayName ?? '',
      last_name: user.last_name ?? undefined,
    };

    await createSession(c, sessionData);
    return c.json({
      success: true,
      user: { directus_id: directusUserId, first_name: sessionData.first_name },
    });
  } catch (error) {
    if (error instanceof LoginTakenError) {
      return c.json({ error: 'Этот логин уже занят. Выберите другой.' }, 409);
    }
    logger.error('activate error:', error);
    return c.json({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});

/**
 * POST /auth/invite/create (admin-only, Bearer INVITE_ADMIN_SECRET).
 */
authRoutes.post('/invite/create', async (c) => {
  const adminSecret = process.env.INVITE_ADMIN_SECRET;
  const auth = c.req.header('authorization');
  if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (body === null) {
    return c.json({ error: 'Некорректный запрос' }, 400);
  }
  const parsed = InviteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: firstZodError(parsed.error) }, 400);
  }
  const { kind, userId } = parsed.data;

  if (kind === 'reset' && !userId) {
    return c.json({ error: 'Для reset требуется userId' }, 400);
  }

  const { url, token } = await createInvite({ kind, userId });
  logger.debug(`invite: issued ${kind} url for userId=${userId ?? '-'}`);
  return c.json({ url, token });
});

/**
 * POST /auth/telegram — mini-app вход. Аккаунты НЕ создаются.
 * tg_id не привязан → 200 { linked: false } БЕЗ сессии (клиент ветвится по linked).
 */
authRoutes.post('/telegram', async (c) => {
  try {
    const { initData } = (await c.req.json().catch(() => ({}))) as { initData?: string };
    if (!initData) {
      return c.json({ error: 'Missing initData' }, 400);
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      logger.error('TELEGRAM_BOT_TOKEN is not set');
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const result = verifyTelegramInitData(initData, botToken);
    if (!result.valid || !result.user) {
      return c.json({ error: result.error || 'Invalid user data' }, 401);
    }

    const telegramUser = result.user;
    const directusUserId = await getUserByTelegramId(telegramUser.id);

    if (!directusUserId) {
      logger.debug(`telegram: tg_id=${telegramUser.id} linked=false`);
      return c.json({ linked: false });
    }

    const user = (await readProfileByAdmin(directusUserId)) ?? {};

    await createSession(c, {
      directus_id: directusUserId,
      first_name: user.first_name ?? telegramUser.first_name,
      last_name: user.last_name ?? telegramUser.last_name,
      username: telegramUser.username,
    });
    logger.debug(`telegram: tg_id=${telegramUser.id} linked=true user=${directusUserId}`);
    return c.json({
      success: true,
      linked: true,
      user: { directus_id: directusUserId, first_name: user.first_name ?? telegramUser.first_name },
    });
  } catch (error) {
    logger.error('telegram error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /auth/telegram/link — однократная привязка tg-аккаунта к пароль-аккаунту.
 */
authRoutes.post('/telegram/link', async (c) => {
  try {
    const ip = clientIp(c.req.raw);
    if (!checkRateLimit(`tg-link:${ip}`, 10, 15 * 60 * 1000)) {
      logger.warn(`rate limit: tg-link ip=${ip}`);
      return c.json({ error: 'Слишком много попыток. Подождите.' }, 429);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = TelegramLinkSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: firstZodError(parsed.error) }, 400);
    }
    const { initData, login, password } = parsed.data;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      logger.error('TELEGRAM_BOT_TOKEN is not set');
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const result = verifyTelegramInitData(initData, botToken);
    if (!result.valid || !result.user) {
      return c.json({ error: result.error || 'Invalid Telegram data' }, 401);
    }

    const email = loginToEmail(login.trim());
    const loginRes = await fetch(`${directusUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) {
      return c.json({ error: 'Неверный логин или пароль' }, 401);
    }
    const { data } = (await loginRes.json()) as { data?: { access_token?: string } };
    const accessToken = data?.access_token;

    const meRes = await fetch(`${directusUrl()}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      return c.json({ error: 'Не удалось получить данные пользователя' }, 500);
    }
    const { data: user } = (await meRes.json()) as {
      data?: { id?: string | number; email?: string; first_name?: string; last_name?: string };
    };
    const directusUserId = String(user?.id);

    await linkTelegramToUser(directusUserId, result.user.id);

    const sessionData: SessionData = {
      directus_id: directusUserId,
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? undefined,
      username: user?.email ?? undefined,
    };

    await createSession(c, sessionData);
    logger.debug(`telegram: linked tg_id=${result.user.id} -> user=${directusUserId}`);
    return c.json({
      success: true,
      user: { directus_id: directusUserId, first_name: sessionData.first_name },
    });
  } catch (error) {
    if (error instanceof TelegramAlreadyLinkedError) {
      return c.json({ error: 'Этот Telegram уже привязан к другому аккаунту.' }, 409);
    }
    logger.error('telegram link error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
