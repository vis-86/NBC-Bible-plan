// @ts-nocheck - Directus SDK typing issue with custom schema
import { getDirectusAdminClient } from '@/lib/directus';
import { readItems, createItem, createUser, readUser, readUsers, updateUser, readRoles } from '@directus/sdk';

/**
 * Синтетический email-домен для псевдонимных веб-аккаунтов (без реальных ПД, ФЗ-152).
 * Должен быть с реальным TLD: Directus валидирует формат email и отклоняет
 * single-label домены вроде `@local` ("Value has to be a valid email address").
 * `local.baptistnn.ru` — поддомен своего домена без MX: формат валиден, почта не доставляется.
 */
export const LOCAL_EMAIL_DOMAIN = 'local.baptistnn.ru';

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[directus-user]', ...args);
}

/** Находит id роли «Чтец» (или null, если не найдена). */
async function getReaderRoleId(adminClient: ReturnType<typeof getDirectusAdminClient>): Promise<string | null> {
  const roles = await adminClient.request(readRoles({ filter: { name: { _eq: 'Чтец' } }, limit: 1 }));
  return roles.length > 0 ? roles[0].id : null;
}

/** Преобразует логин-handle в синтетический email `{login}@local.baptistnn.ru`. */
export function loginToEmail(login: string): string {
  return login.includes('@') ? login : `${login.toLowerCase()}@${LOCAL_EMAIL_DOMAIN}`;
}

export class LoginTakenError extends Error {
  constructor(login: string) {
    super(`Login already taken: ${login}`);
    this.name = 'LoginTakenError';
  }
}

/**
 * Создаёт псевдонимного веб-пользователя по логину+паролю.
 * email = `{login}@local.baptistnn.ru`. Бросает LoginTakenError при занятом логине.
 * @returns directus user id
 */
export async function createLocalUser(
  login: string,
  password: string,
  displayName?: string
): Promise<string> {
  const adminClient = getDirectusAdminClient();
  const email = loginToEmail(login);

  const existing = await adminClient.request(
    readUsers({ filter: { email: { _eq: email } }, limit: 1, fields: ['id'] })
  );
  if (existing.length > 0) {
    debug('login taken', login);
    throw new LoginTakenError(login);
  }

  const roleId = await getReaderRoleId(adminClient);
  const newUser = await adminClient.request(
    createUser({
      role: roleId,
      email,
      password,
      first_name: displayName || login,
      external_identifier: `web_${login.toLowerCase()}`,
      status: 'active',
    })
  );
  debug('local user created', newUser.id, login);
  return newUser.id;
}

/** Устанавливает новый пароль пользователя через admin API (для reset). */
export async function setUserPassword(userId: string, password: string): Promise<void> {
  const adminClient = getDirectusAdminClient();
  await adminClient.request(updateUser(userId, { password }));
  debug('password set for user', userId);
}

/** Создаёт mapping tg_id → directus_user. Бросает, если tg_id уже привязан к другому юзеру. */
export async function linkTelegramToUser(directusUserId: string, telegramUserId: number): Promise<void> {
  const adminClient = getDirectusAdminClient();
  const existing = await adminClient.request(
    readItems('telegram_user_mapping', {
      filter: { telegram_user_id: { _eq: telegramUserId } },
      limit: 1,
    })
  );
  if (existing.length > 0) {
    const mappedId = (existing[0] as any).directus_user_id;
    if (mappedId === directusUserId) return; // уже привязан к этому же юзеру — идемпотентно
    throw new TelegramAlreadyLinkedError(telegramUserId);
  }
  await adminClient.request(
    createItem('telegram_user_mapping', {
      directus_user_id: directusUserId,
      telegram_user_id: telegramUserId,
    })
  );
  debug('telegram linked', telegramUserId, '->', directusUserId);
}

export class TelegramAlreadyLinkedError extends Error {
  constructor(telegramUserId: number) {
    super(`Telegram id ${telegramUserId} already linked to another account`);
    this.name = 'TelegramAlreadyLinkedError';
  }
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

// findOrCreateUser удалён намеренно: mini-app больше НЕ создаёт аккаунты
// (RESEARCH, Вариант 1). Привязка существующего аккаунта — через linkTelegramToUser
// после проверки логина/пароля (см. /api/auth/telegram/link). Это исключает дубли.

/**
 * Имя роли пользователя (для резолва AppRole) — только админ-клиентом.
 * Инвариант: `/users/me` под user-токеном не использовать, policy роли «Чтец» отдаёт только `id`.
 * @returns имя роли или null, если пользователь/роль не найдены.
 */
export async function getUserRoleName(directusUserId: string): Promise<string | null> {
  const adminClient = getDirectusAdminClient();
  const user: { role?: { name?: string | null } | null } = await adminClient.request(
    readUser(directusUserId, { fields: ['role.name'] })
  );
  const roleName = user?.role?.name;
  debug('role lookup', directusUserId, '->', roleName ?? null);
  return typeof roleName === 'string' ? roleName : null;
}

/**
 * Получает Directus User ID по Telegram ID
 */
export async function getUserByTelegramId(telegramId: number): Promise<string | null> {
  const adminClient = getDirectusAdminClient();

  const mappings = await adminClient.request(
    readItems('telegram_user_mapping', {
      filter: { telegram_user_id: { _eq: telegramId } },
      limit: 1,
    })
  );

  if (mappings.length === 0) {
    return null;
  }

  return (mappings[0] as any).directus_user_id;
}

