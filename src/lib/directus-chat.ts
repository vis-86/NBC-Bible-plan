// @ts-nocheck - Directus SDK typing issue with custom schema
import { getDirectusAdminClient } from '@/lib/directus';
import { readItems, createItem, updateItem, deleteItems } from '@directus/sdk';
import { ChatMessage } from '@/types';

export interface ChatHistoryRecord {
  id?: number;
  directus_user_id: string;
  pastor_id: string; // PastorType (THEOLOGIAN, PRACTICAL, etc.)
  messages: ChatMessage[]; // JSON массив сообщений
  updated_at?: string;
  created_at?: string;
}

/**
 * Получает историю чата пользователя с конкретным пастором
 */
export async function getChatHistory(
  directusUserId: string,
  pastorId: string
): Promise<ChatMessage[]> {
  const adminClient = getDirectusAdminClient();

  const records = await adminClient.request(
    readItems('chat_history', {
      filter: {
        _and: [
          { directus_user_id: { _eq: directusUserId } },
          { pastor_id: { _eq: pastorId } }
        ]
      },
      limit: 1,
    })
  );

  if (records.length === 0) {
    return [];
  }

  const record = records[0] as any;
  // messages хранится как JSON, Directus автоматически парсит его
  return record.messages || [];
}

/**
 * Получает историю чата с пагинацией
 * @param directusUserId ID пользователя Directus
 * @param pastorId ID пастора
 * @param limit Количество сообщений для возврата (по умолчанию 20)
 * @param offset Смещение от начала (по умолчанию 0 - последние сообщения)
 * @returns Объект с сообщениями и информацией о пагинации
 */
export async function getChatHistoryPaginated(
  directusUserId: string,
  pastorId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ messages: ChatMessage[]; total: number; hasMore: boolean }> {
  const adminClient = getDirectusAdminClient();

  const records = await adminClient.request(
    readItems('chat_history', {
      filter: {
        _and: [
          { directus_user_id: { _eq: directusUserId } },
          { pastor_id: { _eq: pastorId } }
        ]
      },
      limit: 1,
    })
  );

  if (records.length === 0) {
    return { messages: [], total: 0, hasMore: false };
  }

  const record = records[0] as any;
  const allMessages: ChatMessage[] = record.messages || [];
  const total = allMessages.length;

  // Для пагинации "снизу вверх" (новые сообщения в конце):
  // Берем последние (limit + offset) сообщений, затем берем первые limit
  const startIndex = Math.max(0, total - limit - offset);
  const endIndex = total - offset;
  const messages = allMessages.slice(startIndex, endIndex);
  const hasMore = startIndex > 0;

  return { messages, total, hasMore };
}

/**
 * Сохраняет историю чата пользователя с конкретным пастором
 */
export async function saveChatHistory(
  directusUserId: string,
  pastorId: string,
  messages: ChatMessage[]
): Promise<void> {
  const adminClient = getDirectusAdminClient();

  // Проверяем есть ли уже запись для этого пользователя и пастора
  const existingRecords = await adminClient.request(
    readItems('chat_history', {
      filter: {
        _and: [
          { directus_user_id: { _eq: directusUserId } },
          { pastor_id: { _eq: pastorId } }
        ]
      },
      limit: 1,
    })
  );

  if (existingRecords.length > 0) {
    // Обновляем существующую запись
    await adminClient.request(
      updateItem('chat_history', existingRecords[0].id, {
        messages: messages,
      })
    );
  } else {
    // Создаём новую запись
    await adminClient.request(
      createItem('chat_history', {
        directus_user_id: directusUserId,
        pastor_id: pastorId,
        messages: messages,
      })
    );
  }
}

/**
 * Удаляет историю чата пользователя с конкретным пастором
 */
export async function clearChatHistory(
  directusUserId: string,
  pastorId: string
): Promise<void> {
  const adminClient = getDirectusAdminClient();

  const records = await adminClient.request(
    readItems('chat_history', {
      filter: {
        _and: [
          { directus_user_id: { _eq: directusUserId } },
          { pastor_id: { _eq: pastorId } }
        ]
      },
    })
  );

  if (records.length > 0) {
    const recordIds = records.map((r: any) => r.id);
    await adminClient.request(deleteItems('chat_history', recordIds));
  }
}


