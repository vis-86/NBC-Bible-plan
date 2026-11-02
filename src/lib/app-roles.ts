/**
 * Роли приложения (M2). Приходят отдельным запросом (`GET /api/user/role`),
 * не кладутся в iron-session cookie — см. `CLAUDE.md` (кэш в cookie требует refresh-пути).
 *
 * Правила: `musician` — CRUD сетлистов; `musician_editor` — то же плюс создание и
 * редактирование песен; `team_admin` — права `musician_editor` плюс управление командой
 * (участники и инвайты).
 */

export const APP_ROLES = ['reader', 'musician', 'musician_editor', 'team_admin'] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Ключ — имя роли Directus в нижнем регистре. */
export const DIRECTUS_ROLE_TO_APP_ROLE: Record<string, AppRole> = {
  musician: 'musician',
  musician_editor: 'musician_editor',
  team_admin: 'team_admin',
};

/** Обратная карта: какую роль Directus выдать аккаунту с ролью приложения (создание по инвайту). */
export const APP_ROLE_TO_DIRECTUS_ROLE: Record<AppRole, string> = {
  reader: 'Чтец',
  musician: 'musician',
  musician_editor: 'musician_editor',
  team_admin: 'team_admin',
};

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[app-roles]', ...args);
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
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
  return role === 'musician' || role === 'musician_editor' || role === 'team_admin';
}

export function canEditSongs(role: AppRole): boolean {
  return role === 'musician_editor' || role === 'team_admin';
}

/** Участники и инвайты своей команды — только `team_admin`. */
export function canManageTeam(role: AppRole): boolean {
  return role === 'team_admin';
}
