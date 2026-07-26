/**
 * Гейт записи для сетлистов. Реальный контур контроля — BFF (Directus права —
 * второй рубеж, приложение ходит админ-токеном). См. `.ai-factory/plans/feature-setlists.md`.
 */
import type { Context, Next } from 'hono';
import { canManageSetlists, resolveAppRole, type AppRole } from '../../../src/lib/app-roles';
import { getUserRoleName } from '../../../src/lib/directus-user';
import { logger } from '../logger';
import { getSession } from '../session';

declare module 'hono' {
  interface ContextVariableMap {
    appRole: AppRole;
  }
}

export async function requireSetlistWrite(c: Context, next: Next) {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const directusRoleName = await getUserRoleName(session.directus_id);
  const role = resolveAppRole(directusRoleName);
  logger.debug(`[role] resolved ${session.directus_id} -> ${role}`);

  if (!canManageSetlists(role)) {
    logger.warn(`[role] denied setlist write for ${session.directus_id} (${role})`);
    return c.json({ error: 'Forbidden' }, 403);
  }

  c.set('appRole', role);
  await next();
}
