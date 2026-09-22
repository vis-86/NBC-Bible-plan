/**
 * Гейты записи: сетлисты (M7) и песни (M9). Реальный контур контроля — BFF (Directus
 * права — второй рубеж, приложение ходит админ-токеном).
 * См. `.ai-factory/plans/feature-setlists.md`, `.ai-factory/plans/feature-song-editor.md`.
 */
import type { Context, Next } from 'hono';
import { canEditSongs, canManageSetlists, resolveAppRole, type AppRole } from '../../../src/lib/app-roles';
import { getUserRoleName } from '../../../src/lib/directus-user';
import { logger } from '../logger';
import { getSession } from '../session';

declare module 'hono' {
  interface ContextVariableMap {
    appRole: AppRole;
  }
}

/** Общая часть гейтов: сессия → роль Directus → роль приложения → проверка права. */
function requireRole(allowed: (role: AppRole) => boolean, what: string) {
  return async function gate(c: Context, next: Next) {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const directusRoleName = await getUserRoleName(session.directus_id);
    const role = resolveAppRole(directusRoleName);
    logger.debug(`[role] resolved ${session.directus_id} -> ${role}`);

    if (!allowed(role)) {
      logger.warn(`[role] denied ${what} for ${session.directus_id} (${role})`);
      return c.json({ error: 'Forbidden' }, 403);
    }

    c.set('appRole', role);
    await next();
  };
}

export const requireSetlistWrite = requireRole(canManageSetlists, 'setlist write');

/** Правка и создание песен — только `musician_editor` (M9). */
export const requireSongWrite = requireRole(canEditSongs, 'song write');
