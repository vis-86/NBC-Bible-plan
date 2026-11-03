/**
 * Управление командой (участники и инвайты) через admin-клиент Directus.
 * Клиент в Directus напрямую не ходит — только через эти функции + `server/src/routes/team.ts`.
 *
 * Админ-токен видит пользователей всех команд, поэтому каждая функция принимает `teamId`
 * первым аргументом, а всё, что адресует участника, сначала проверяет его членство
 * в `team_members` этой команды. `teamId` — только из `requireTeam` (членство по сессии),
 * никогда из запроса.
 */
import { deleteItem, readItems, readRoles, updateUser } from '@directus/sdk';
import { APP_ROLE_TO_DIRECTUS_ROLE, resolveAppRole, type AppRole } from '@/lib/app-roles';
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

type UserRow = {
  id?: string;
  email?: string | null;
  first_name?: string | null;
  status?: string | null;
  role?: { name?: string | null } | null;
};

function assertTeamId(teamId: unknown): asserts teamId is string {
  if (typeof teamId !== 'string' || !teamId) {
    throw new Error('teamId is required');
  }
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

/** Участники команды. Членство без пользователя (удалён в Directus) пропускается. */
export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  assertTeamId(teamId);
  // Вложенные поля SDK типизирует плоскими ключами `user.id`, а Directus отдаёт объект `user`.
  const rows = (await getDirectusAdminClient().request(
    // @ts-expect-error коллекции DirectusSchema — объекты, SDK v20 сужает readItems до never (см. src/lib/teams.ts)
    readItems('team_members', {
      filter: { team: { _eq: teamId } },
      fields: ['user.id', 'user.email', 'user.first_name', 'user.status', 'user.role.name'],
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
    members.push({
      userId: user.id,
      login: emailToLogin(user.email),
      displayName: user.first_name ?? null,
      role: resolveAppRole(user.role?.name),
      active: user.status === 'active',
    });
  }
  return members;
}

/** id записи членства пользователя в команде или null, если он не в этой команде. */
async function findMembershipId(teamId: string, userId: string): Promise<string | number | null> {
  const rows: Array<{ id?: string | number }> = await getDirectusAdminClient().request(
    // @ts-expect-error коллекции DirectusSchema — объекты, SDK v20 сужает readItems до never (см. src/lib/teams.ts)
    readItems('team_members', {
      filter: { team: { _eq: teamId }, user: { _eq: userId } },
      fields: ['id'],
      limit: 1,
    }),
  );
  return rows?.[0]?.id ?? null;
}

/** Активационная ссылка в команду с заданной ролью. */
export async function createTeamInvite(teamId: string, role: AppRole): Promise<{ url: string }> {
  assertTeamId(teamId);
  const { url } = await createInvite({ kind: 'activate', teamId, role });
  return { url };
}

/** Ссылка для смены пароля участника. null — пользователь не в этой команде. */
export async function createMemberResetInvite(
  teamId: string,
  userId: string,
): Promise<{ url: string } | null> {
  assertTeamId(teamId);
  if ((await findMembershipId(teamId, userId)) === null) return null;
  const { url } = await createInvite({ kind: 'reset', userId });
  return { url };
}

/**
 * Меняет роль Directus участника. false — пользователь не в этой команде.
 * Роли Directus нет — бросает: запись `role: null` оставила бы аккаунт без роли.
 */
export async function setMemberRole(teamId: string, userId: string, role: AppRole): Promise<boolean> {
  assertTeamId(teamId);
  if ((await findMembershipId(teamId, userId)) === null) return false;

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
 * восстановимо вручную), членство удаляется, сам аккаунт остаётся.
 * false — пользователь не в этой команде.
 *
 * Сначала приостановка, потом членство: если второй шаг упадёт, повтор найдёт
 * членство и доведёт дело. В обратном порядке повтор ответил бы 404, а аккаунт
 * остался бы активным.
 */
export async function removeMember(teamId: string, userId: string): Promise<boolean> {
  assertTeamId(teamId);
  const membershipId = await findMembershipId(teamId, userId);
  if (membershipId === null) return false;

  const client = getDirectusAdminClient();
  await client.request(updateUser(userId, { status: 'suspended' }));
  await client.request(deleteItem('team_members', membershipId));
  console.debug(`${LOG} remove: ${userId} suspended and removed from team ${teamId}`);
  return true;
}
