/**
 * Управление командой (участники и инвайты) через admin-клиент Directus.
 * Клиент в Directus напрямую не ходит — только через эти функции + `server/src/routes/team.ts`.
 *
 * Админ-токен видит пользователей всех команд, поэтому каждая функция принимает `teamId`
 * первым аргументом, а всё, что адресует участника, сначала проверяет его членство
 * в `team_members` этой команды. `teamId` — только из `requireTeam` (членство по сессии),
 * никогда из запроса.
 *
 * `team_admin` управляет только обычными участниками (`reader`/`musician`/`musician_editor`).
 * Другие `team_admin` — забота администратора приложения (`TeamAdminTargetError`), а аккаунты
 * вне ролей приложения (роль Directus вне `AppRole` или политика с `admin_access`) для команды
 * не существуют: в списке их нет, действия над ними — как над чужими.
 */
import { deleteItem, readItems, readRoles, updateItems, updateUser } from '@directus/sdk';
import { APP_ROLE_TO_DIRECTUS_ROLE, type AppRole } from '@/lib/app-roles';
import { getDirectusAdminClient } from '@/lib/directus';
import { createInvite } from '@/lib/invite';
import { emailToLogin } from '@/lib/local-email';

const LOG = '[team]';

export interface TeamInfo {
  id: string;
  name: string;
}

/** Только то, что нужно для управления участником: без email/телефона/ФИО (ФЗ-152). */
export interface TeamMember {
  userId: string;
  /** null — аккаунт не с синтетическим email (логина для входа нет). */
  login: string | null;
  displayName: string | null;
  role: AppRole;
  /** false — аккаунт приостановлен или ещё не активирован в Directus. */
  active: boolean;
}

/** Запись `directus_access`: политика, выданная роли или пользователю. */
type AccessRow = { policy?: { admin_access?: boolean | null } | null } | null;

type UserRow = {
  id?: string;
  email?: string | null;
  first_name?: string | null;
  status?: string | null;
  role?: { name?: string | null; policies?: AccessRow[] | null } | null;
  policies?: AccessRow[] | null;
};

/** Поля пользователя, по которым решается, может ли команда им управлять (`memberAppRole`). */
const USER_ROLE_FIELDS = [
  'user.role.name',
  'user.role.policies.policy.admin_access',
  'user.policies.policy.admin_access',
];

/** Имя роли Directus (без учёта регистра) → роль приложения. */
const APP_ROLE_BY_DIRECTUS_NAME = new Map(
  (Object.entries(APP_ROLE_TO_DIRECTUS_ROLE) as Array<[AppRole, string]>).map(([appRole, name]) => [
    name.toLowerCase(),
    appRole,
  ]),
);

/** Цель — другой `team_admin`: его роль, доступ и пароль меняет только администратор приложения. */
export class TeamAdminTargetError extends Error {
  constructor(userId: string) {
    super(`team_admin cannot be managed by the team: ${userId}`);
    this.name = 'TeamAdminTargetError';
  }
}

function assertTeamId(teamId: unknown): asserts teamId is string {
  if (typeof teamId !== 'string' || !teamId) {
    throw new Error('teamId is required');
  }
}

/**
 * Роль участника с точки зрения команды. null — аккаунт вне ролей приложения: политика
 * с `admin_access` (у роли или у самого пользователя) либо роль Directus вне `AppRole`.
 * Без роли Directus — `reader`, как в `resolveAppRole`.
 */
function memberAppRole(user: UserRow): AppRole | null {
  const access = [...(user.role?.policies ?? []), ...(user.policies ?? [])];
  if (access.some((row) => row?.policy?.admin_access === true)) return null;
  if (user.role == null) return 'reader';
  const roleName = user.role.name;
  if (typeof roleName !== 'string') return null;
  return APP_ROLE_BY_DIRECTUS_NAME.get(roleName.toLowerCase()) ?? null;
}

/** Команда по id или null, если её нет. */
export async function getTeam(teamId: string): Promise<TeamInfo | null> {
  assertTeamId(teamId);
  const rows: Array<{ id: string; name?: string | null }> = await getDirectusAdminClient().request(
    // @ts-expect-error коллекции DirectusSchema — объекты, SDK v20 сужает readItems до never (см. src/lib/teams.ts)
    readItems('teams', {
      filter: { id: { _eq: teamId } },
      fields: ['id', 'name'],
      limit: 1,
    }),
  );
  const team = rows?.[0];
  if (!team) return null;
  return { id: String(team.id), name: team.name ?? '' };
}

/**
 * Участники команды. Пропускаются членство без пользователя (удалён в Directus) и аккаунты
 * вне ролей приложения.
 */
export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  assertTeamId(teamId);
  // Вложенные поля SDK типизирует плоскими ключами `user.id`, а Directus отдаёт объект `user`.
  const rows = (await getDirectusAdminClient().request(
    // @ts-expect-error коллекции DirectusSchema — объекты, SDK v20 сужает readItems до never (см. src/lib/teams.ts)
    readItems('team_members', {
      filter: { team: { _eq: teamId } },
      fields: ['user.id', 'user.email', 'user.first_name', 'user.status', ...USER_ROLE_FIELDS],
      limit: -1,
    }),
  )) as unknown as Array<{ user?: UserRow | null }>;

  const members: TeamMember[] = [];
  for (const row of rows ?? []) {
    const user = row?.user;
    if (!user || typeof user.id !== 'string') {
      console.warn(`${LOG} members: membership without user skipped in team ${teamId}`);
      continue;
    }
    const role = memberAppRole(user);
    if (!role) {
      console.debug(`${LOG} members: ${user.id} is outside app roles, hidden in team ${teamId}`);
      continue;
    }
    members.push({
      userId: user.id,
      login: emailToLogin(user.email),
      displayName: user.first_name ?? null,
      role,
      active: user.status === 'active',
    });
  }
  return members;
}

/**
 * id записи членства участника, которым команда может управлять.
 * null — пользователь не в этой команде или вне ролей приложения (неразличимо для вызывающего).
 * Бросает `TeamAdminTargetError`, если участник — `team_admin`.
 */
async function findManageableMembershipId(teamId: string, userId: string): Promise<string | number | null> {
  const rows = (await getDirectusAdminClient().request(
    // @ts-expect-error коллекции DirectusSchema — объекты, SDK v20 сужает readItems до never (см. src/lib/teams.ts)
    readItems('team_members', {
      filter: { team: { _eq: teamId }, user: { _eq: userId } },
      fields: ['id', ...USER_ROLE_FIELDS],
      limit: 1,
    }),
  )) as unknown as Array<{ id?: string | number; user?: UserRow | null }>;

  const row = rows?.[0];
  if (row?.id == null || !row.user) return null;

  const role = memberAppRole(row.user);
  if (!role) {
    console.warn(`${LOG} ${userId} is outside app roles, treated as absent in team ${teamId}`);
    return null;
  }
  if (role === 'team_admin') throw new TeamAdminTargetError(userId);
  return row.id;
}

/** Активационная ссылка в команду с заданной ролью. */
export async function createTeamInvite(teamId: string, role: AppRole): Promise<{ url: string }> {
  assertTeamId(teamId);
  const { url } = await createInvite({ kind: 'activate', teamId, role });
  return { url };
}

/**
 * Ссылка для смены пароля участника. null — пользователь не в этой команде.
 * Бросает `TeamAdminTargetError` для `team_admin`.
 */
export async function createMemberResetInvite(
  teamId: string,
  userId: string,
): Promise<{ url: string } | null> {
  assertTeamId(teamId);
  if ((await findManageableMembershipId(teamId, userId)) === null) return null;
  const { url } = await createInvite({ kind: 'reset', userId });
  return { url };
}

/**
 * Меняет роль Directus участника. false — пользователь не в этой команде.
 * Бросает `TeamAdminTargetError` для `team_admin`. Роли Directus нет — бросает: запись
 * `role: null` оставила бы аккаунт без роли.
 */
export async function setMemberRole(teamId: string, userId: string, role: AppRole): Promise<boolean> {
  assertTeamId(teamId);
  if ((await findManageableMembershipId(teamId, userId)) === null) return false;

  const client = getDirectusAdminClient();
  const roleName = APP_ROLE_TO_DIRECTUS_ROLE[role];
  const roles: Array<{ id: string }> = await client.request(
    readRoles({ filter: { name: { _eq: roleName } }, fields: ['id'], limit: 1 }),
  );
  const roleId = roles?.[0]?.id;
  if (!roleId) {
    throw new Error(`directus role not found: ${roleName}`);
  }

  await client.request(updateUser(userId, { role: roleId }));
  console.debug(`${LOG} role: ${userId} -> ${role} in team ${teamId}`);
  return true;
}

/**
 * Убирает участника из команды: аккаунт приостанавливается (вход перестаёт работать,
 * восстановимо вручную), его неиспользованные инвайты гасятся (выданная раньше
 * reset-ссылка не вернёт доступ), членство удаляется, сам аккаунт остаётся.
 * false — пользователь не в этой команде. Бросает `TeamAdminTargetError` для `team_admin`.
 *
 * Членство удаляется последним: если промежуточный шаг упадёт, повтор найдёт
 * членство и доведёт дело. В обратном порядке повтор ответил бы 404, а аккаунт
 * остался бы активным.
 */
export async function removeMember(teamId: string, userId: string): Promise<boolean> {
  assertTeamId(teamId);
  const membershipId = await findManageableMembershipId(teamId, userId);
  if (membershipId === null) return false;

  const client = getDirectusAdminClient();
  await client.request(updateUser(userId, { status: 'suspended' }));
  await client.request(
    updateItems(
      'auth_invites',
      { filter: { user: { _eq: userId }, used_at: { _null: true } } },
      { used_at: new Date().toISOString() },
    ),
  );
  await client.request(deleteItem('team_members', membershipId));
  console.debug(`${LOG} remove: ${userId} suspended and removed from team ${teamId}`);
  return true;
}
