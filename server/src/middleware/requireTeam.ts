/**
 * Гейт команды: команда берётся только из членства по `directus_id` сессии.
 * Нет членства — 403, сбой Directus — 503 (не «пусто» и не 403).
 */
import type { Context, Next } from 'hono';
import { getUserTeamId } from '../../../src/lib/teams';
import { logger } from '../logger';
import { getSession } from '../session';

declare module 'hono' {
  interface ContextVariableMap {
    teamId: string;
  }
}

export async function requireTeam(c: Context, next: Next) {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  let teamId: string | null;
  try {
    teamId = await getUserTeamId(session.directus_id);
  } catch (err) {
    logger.error(`[team] membership lookup failed for ${session.directus_id}`, err);
    return c.json({ error: 'Upstream unavailable' }, 503);
  }

  if (!teamId) {
    logger.warn(`[team] no team for ${session.directus_id}`);
    return c.json({ error: 'No team' }, 403);
  }

  logger.debug(`[team] resolved ${session.directus_id} -> ${teamId}`);
  c.set('teamId', teamId);
  await next();
}
