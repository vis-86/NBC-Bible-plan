/**
 * Команда пользователя (мультитенантность): членство хранится в `team_members`,
 * один пользователь = одна команда. Серверный модуль — только admin-клиент Directus.
 */
import { createItem, readItems } from '@directus/sdk';
import { getDirectusAdminClient } from './directus';

export const NBC_TEAM_SLUG = 'nbc';

/** M2O-поле приходит id-строкой или объектом `{ id }` — приводим к строке. */
function relationId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

/** Команда пользователя или null, если членства нет. Ошибки Directus пробрасываются. */
export async function getUserTeamId(directusUserId: string): Promise<string | null> {
  if (!directusUserId) return null;
  const rows = await getDirectusAdminClient().request(
    // @ts-expect-error коллекции DirectusSchema — объекты, SDK v20 сужает readItems до never (см. setlistsServer.ts)
    readItems('team_members', {
      filter: { user: { _eq: directusUserId } },
      fields: ['team'],
      limit: 1,
    }),
  );
  return relationId(rows?.[0]?.team);
}

/** id команды по slug или null. Ошибки Directus пробрасываются. */
export async function getTeamIdBySlug(slug: string): Promise<string | null> {
  if (!slug) return null;
  const rows = await getDirectusAdminClient().request(
    // @ts-expect-error коллекции DirectusSchema — объекты, SDK v20 сужает readItems до never (см. setlistsServer.ts)
    readItems('teams', {
      filter: { slug: { _eq: slug } },
      fields: ['id'],
      limit: 1,
    }),
  );
  return relationId(rows?.[0]?.id);
}

export async function addTeamMember(teamId: string, directusUserId: string): Promise<void> {
  await getDirectusAdminClient().request(
    createItem('team_members', { team: teamId, user: directusUserId }),
  );
}
