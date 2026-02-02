import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getChatHistory, getChatHistoryPaginated, saveChatHistory, clearChatHistory } from '@/lib/directus-chat';
import { ChatMessage } from '@/types';

/**
 * GET /api/chat/history
 * Получает историю чата пользователя с конкретным пастором
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const pastorId = searchParams.get('pastor_id');

    if (!pastorId) {
      return NextResponse.json(
        { error: 'Не указан pastor_id' },
        { status: 400 }
      );
    }

    // Поддержка пагинации
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    if (limitParam || offsetParam) {
      const limit = limitParam ? parseInt(limitParam, 10) : 20;
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
      
      const result = await getChatHistoryPaginated(
        session.directus_id,
        pastorId,
        limit,
        offset
      );
      
      return NextResponse.json(result);
    }

    // Обратная совместимость: если параметры не указаны, возвращаем все сообщения
    const messages = await getChatHistory(session.directus_id, pastorId);

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error getting chat history:', error);
    return NextResponse.json(
      { error: 'Ошибка при получении истории чата' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/history
 * Сохраняет историю чата пользователя с конкретным пастором
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { pastor_id, messages } = body;

    if (!pastor_id || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Неверный формат данных. Требуются pastor_id и messages' },
        { status: 400 }
      );
    }

    // Валидация структуры сообщений
    const validMessages: ChatMessage[] = messages.filter((msg: any) => 
      msg.id && msg.role && msg.text && msg.timestamp
    );

    await saveChatHistory(session.directus_id, pastor_id, validMessages);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving chat history:', error);
    return NextResponse.json(
      { error: 'Ошибка при сохранении истории чата' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/history
 * Удаляет историю чата пользователя с конкретным пастором
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const pastorId = searchParams.get('pastor_id');

    if (!pastorId) {
      return NextResponse.json(
        { error: 'Не указан pastor_id' },
        { status: 400 }
      );
    }

    await clearChatHistory(session.directus_id, pastorId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    return NextResponse.json(
      { error: 'Ошибка при удалении истории чата' },
      { status: 500 }
    );
  }
}


