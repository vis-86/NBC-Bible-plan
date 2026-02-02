// @ts-nocheck - Directus SDK typing issue with custom schema
import { getDirectusAdminClient } from '@/lib/directus';
import { readItems, createItem, createUser, readRoles } from '@directus/sdk';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

/**
 * Находит или создает пользователя в Directus на основе Telegram данных
 */
export async function findOrCreateUser(telegramUser: TelegramUser): Promise<string> {
  const adminClient = getDirectusAdminClient();

  // 1. Ищем маппинг пользователя
  const mappings = await adminClient.request(
    readItems('telegram_user_mapping', {
      filter: { telegram_user_id: { _eq: telegramUser.id } },
      limit: 1,
    })
  );

  if (mappings.length > 0) {
    return (mappings[0] as any).directus_user_id;
  }

  // 2. Если пользователя нет, создаем его
  // Ищем роль "Чтец"
  const roles = await adminClient.request(
    readRoles({
      filter: { name: { _eq: 'Чтец' } },
      limit: 1,
    })
  );

  const readerRoleId = roles.length > 0 ? roles[0].id : null;
  if (!readerRoleId) {
    console.warn('Role "Чтец" not found in Directus, creating user without role or with default');
  }

  // Создаем пользователя в Directus
  const newUser = await adminClient.request(
    createUser({
      role: readerRoleId,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name,
      external_identifier: `tg_${telegramUser.id}`,
      email: `${telegramUser.id}@telegram.bot`, // Фейковый email для Directus
      status: 'active',
    })
  );

  const directusUserId = newUser.id;

  // Создаем маппинг
  await adminClient.request(
    createItem('telegram_user_mapping', {
      directus_user_id: directusUserId,
      telegram_user_id: telegramUser.id,
    })
  );

  return directusUserId;
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

