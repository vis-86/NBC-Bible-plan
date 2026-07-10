/**
 * Порт группы user из src/app/api/user/* (1:1 по поведению).
 * Все роуты session-gated — 401 без сессии.
 */
import { Hono } from 'hono';
import {
  getAppSettings,
  getReadingSettings,
  getUserProgress,
  saveAppSettings,
  saveReadingSettings,
  updateUserProgress,
} from '../../../src/lib/directus-data';
import { logger } from '../logger';
import { getSession } from '../session';

export const userRoutes = new Hono();

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
