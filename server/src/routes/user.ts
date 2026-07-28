/**
 * Порт группы user из src/app/api/user/* (1:1 по поведению).
 * Все роуты session-gated — 401 без сессии.
 */
import { Hono } from 'hono';
import { resolveAppRole } from '../../../src/lib/app-roles';
import {
  getAppSettings,
  getReadingSettings,
  getUserProgress,
  saveAppSettings,
  saveReadingSettings,
  updateUserProgress,
} from '../../../src/lib/directus-data';
import { getUserRoleName, updateUserDisplayName } from '../../../src/lib/directus-user';
import { logger } from '../logger';
import { createSession, getSession } from '../session';

export const userRoutes = new Hono();

/** Границы отображаемого имени. 60 — с запасом под длинное «Имя Фамилия». */
const DISPLAY_NAME_MAX = 60;

/**
 * POST /profile — смена отображаемого имени (Directus `first_name`).
 *
 * Online-only по решению 2026-07-28: осознанное исключение из offline-first
 * (outbox заточен под прогресс, его обобщение — M6). Чтение профиля офлайн
 * работает через `lastKnownUser` в IDB.
 */
userRoutes.post('/profile', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Тело запроса не является JSON' }, 400);
    }

    const raw = (body as { display_name?: unknown } | null)?.display_name;
    if (typeof raw !== 'string') {
      return c.json({ error: 'Поле display_name обязательно' }, 400);
    }

    const displayName = raw.trim();
    if (displayName.length === 0) {
      return c.json({ error: 'Имя не может быть пустым' }, 400);
    }
    if (displayName.length > DISPLAY_NAME_MAX) {
      return c.json({ error: `Имя длиннее ${DISPLAY_NAME_MAX} символов` }, 400);
    }

    logger.debug('[user.profile] update', { userId: session.directus_id, len: displayName.length });
    await updateUserDisplayName(session.directus_id, displayName);

    // Пере-запечатываем cookie сразу: `first_name` в iron-session — это кэш, и без
    // re-seal он остаётся протухшим до следующего GET /auth/session.
    await createSession(c, { ...session, first_name: displayName });
    logger.debug('[user.profile] updated + session re-sealed', { userId: session.directus_id });

    return c.json({
      success: true,
      user: { directus_id: session.directus_id, first_name: displayName },
    });
  } catch (error) {
    logger.error('Error updating profile:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.get('/role', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const directusRoleName = await getUserRoleName(session.directus_id);
    const role = resolveAppRole(directusRoleName);
    logger.debug(`[role] resolved ${session.directus_id} -> ${role}`);
    return c.json({ role });
  } catch (error) {
    logger.error('Error resolving user role:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.get('/app-settings', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const settings = await getAppSettings(session.directus_id);
    return c.json({ settings });
  } catch (error) {
    logger.error('Error getting app settings:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.post('/app-settings', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const theme = body.theme;

    if (theme !== 'light' && theme !== 'dark' && theme !== 'system') {
      return c.json({ error: 'Invalid theme. Use "light", "dark", or "system".' }, 400);
    }

    await saveAppSettings(session.directus_id, { theme });
    return c.json({ success: true });
  } catch (error) {
    logger.error('Error saving app settings:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.get('/progress', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const progress = await getUserProgress(session.directus_id);
    return c.json({ progress });
  } catch (error) {
    logger.error('Error getting user progress:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.post('/progress', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const { day, count } = await c.req.json();

    if (typeof day !== 'number') {
      return c.json({ error: 'Invalid day parameter' }, 400);
    }
    if (count !== null && typeof count !== 'number') {
      return c.json({ error: 'Invalid count parameter' }, 400);
    }

    logger.debug(`user progress update: day=${day} count=${count} user=${session.directus_id}`);
    await updateUserProgress(session.directus_id, day, count);
    logger.debug(`user progress updated: day=${day}`);

    return c.json({ success: true });
  } catch (error) {
    logger.error('Error updating user progress:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.get('/reading-settings', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    // Только server-side: сессия уже проверена. Админ-клиент + фильтр по directus_id —
    // иначе 403/ошибки у роли пользователя на коллекции `reading_settings` и сессии без access_token (Telegram).
    const settings = await getReadingSettings(session.directus_id);
    return c.json({ settings });
  } catch (error) {
    logger.error('Error getting reading settings:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.post('/reading-settings', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const settings = await c.req.json();
    logger.debug('[user.reading-settings] save', { keys: Object.keys(settings) });
    await saveReadingSettings(session.directus_id, settings);
    return c.json({ success: true });
  } catch (error) {
    logger.error('Error saving reading settings:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
