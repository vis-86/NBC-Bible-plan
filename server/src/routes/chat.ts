/**
 * Порт группы chat из src/app/api/chat/history/* (1:1 по поведению).
 */
import { Hono } from 'hono';
import { clearChatHistory, getChatHistory, getChatHistoryPaginated, saveChatHistory } from '../../../src/lib/directus-chat';
import type { ChatMessage } from '../../../src/types/index';
import { logger } from '../logger';
import { getSession } from '../session';

export const chatRoutes = new Hono();

/**
 * GET /chat/history?pastor_id=...&limit=&offset=
 */
chatRoutes.get('/history', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Не авторизован' }, 401);

    const pastorId = c.req.query('pastor_id');
    if (!pastorId) {
      return c.json({ error: 'Не указан pastor_id' }, 400);
    }

    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');

    if (limitParam || offsetParam) {
      const limit = limitParam ? parseInt(limitParam, 10) : 20;
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

      const result = await getChatHistoryPaginated(session.directus_id, pastorId, limit, offset);
      return c.json(result);
    }

    // Обратная совместимость: если параметры не указаны, возвращаем все сообщения
    const messages = await getChatHistory(session.directus_id, pastorId);
    return c.json({ messages });
  } catch (error) {
    logger.error('Error getting chat history:', error);
    return c.json({ error: 'Ошибка при получении истории чата' }, 500);
  }
});

/**
 * POST /chat/history
 */
chatRoutes.post('/history', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Не авторизован' }, 401);

    const body = await c.req.json();
    const { pastor_id, messages } = body;

    if (!pastor_id || !Array.isArray(messages)) {
      return c.json({ error: 'Неверный формат данных. Требуются pastor_id и messages' }, 400);
    }

    const validMessages: ChatMessage[] = messages.filter(
      (msg: ChatMessage) => msg.id && msg.role && msg.text && msg.timestamp
    );

    await saveChatHistory(session.directus_id, pastor_id, validMessages);
    return c.json({ success: true });
  } catch (error) {
    logger.error('Error saving chat history:', error);
    return c.json({ error: 'Ошибка при сохранении истории чата' }, 500);
  }
});

/**
 * DELETE /chat/history?pastor_id=...
 */
chatRoutes.delete('/history', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Не авторизован' }, 401);

    const pastorId = c.req.query('pastor_id');
    if (!pastorId) {
      return c.json({ error: 'Не указан pastor_id' }, 400);
    }

    await clearChatHistory(session.directus_id, pastorId);
    return c.json({ success: true });
  } catch (error) {
    logger.error('Error clearing chat history:', error);
    return c.json({ error: 'Ошибка при удалении истории чата' }, 500);
  }
});
