/**
 * Роли приложения (M2). Приходят отдельным запросом (`GET /api/user/role`),
 * не кладутся в iron-session cookie — см. `CLAUDE.md` (кэш в cookie требует refresh-пути).
 *
 * Правила: `musician` — CRUD сетлистов; `musician_editor` — то же плюс создание и
 * редактирование песен. Гейт песен (`canEditSongs`) пока нигде не вызывается: сама
 * фича правки песен — M9, в коде её ещё нет (BFF по песням только GET).
 */

export type AppRole = 'reader' | 'musician' | 'musician_editor';

/** Ключ — имя роли Directus в нижнем регистре. */
export const DIRECTUS_ROLE_TO_APP_ROLE: Record<string, AppRole> = {
  musician: 'musician',
  musician_editor: 'musician_editor',
};

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[app-roles]', ...args);
}

/** Дефолт — `'reader'`; неизвестное или пустое имя не бросает, а логирует предупреждение. */
export function resolveAppRole(directusRoleName: string | null | undefined): AppRole {
  if (!directusRoleName) {
    debug('no directus role name, using reader');
    return 'reader';
  }

  const normalized = directusRoleName.toLowerCase();
  const role = DIRECTUS_ROLE_TO_APP_ROLE[normalized];
  if (!role) {
    console.warn('[app-roles] unknown directus role, falling back to reader', directusRoleName);
    return 'reader';
  }

  return role;
}

export function canManageSetlists(role: AppRole): boolean {
  return role === 'musician' || role === 'musician_editor';
}

export function canEditSongs(role: AppRole): boolean {
  return role === 'musician_editor';
}
