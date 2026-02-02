// @ts-nocheck - Directus SDK typing issue with custom schema
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDirectusAdminClient, type DirectusAdminClient } from '@/lib/directus';
import { readItems, createItem, updateItem, deleteItem } from '@directus/sdk';

/**
 * GraphQL API endpoint для точечных обновлений
 * POST /api/graphql
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, variables } = await request.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const adminClient = getDirectusAdminClient();

    // Парсим GraphQL запрос (упрощенная версия)
    // В реальности лучше использовать библиотеку для парсинга GraphQL
    const result = await executeGraphQLQuery(adminClient, session.directus_id, query, variables);

    return NextResponse.json({ data: result });
  } catch (error: any) {
    console.error('GraphQL error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function executeGraphQLQuery(
  adminClient: DirectusAdminClient,
  directusUserId: string,
  query: string,
  variables?: any
) {
  // Получаем telegram_user_id
  // @ts-ignore - Directus SDK typing issue with custom schema
  const mappings = await adminClient.request(
    readItems('telegram_user_mapping', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (mappings.length === 0) {
    throw new Error('User mapping not found');
  }

  const telegramUserId = (mappings[0] as any).telegram_user_id;

  // Определяем тип операции (mutation или query)
  const isMutation = query.trim().startsWith('mutation');

  if (isMutation) {
    return await executeMutation(adminClient, telegramUserId, query, variables);
  } else {
    return await executeQuery(adminClient, telegramUserId, query, variables);
  }
}

async function executeMutation(
  adminClient: DirectusAdminClient,
  telegramUserId: number,
  query: string,
  variables?: any
) {
  // Парсим имя операции из GraphQL запроса
  const mutationMatch = query.match(/mutation\s+(\w+)/);
  const operationName = mutationMatch ? mutationMatch[1] : '';
  
  // Обновление прогресса дня
  if (operationName === 'UpdateProgress' || query.includes('updateProgress')) {
    const { day, count, completedItems } = variables || {};
    
    if (typeof day !== 'number') {
      throw new Error('Invalid day parameter');
    }

    if (count !== null && typeof count !== 'number') {
      throw new Error('Invalid count parameter');
    }

    const currentYear = new Date().getFullYear();

    // Проверяем существующие записи
    // @ts-ignore - Directus SDK typing issue with custom schema
    const existingRecords = await adminClient.request(
      readItems('reading', {
        filter: {
          _and: [
            { user_id: { _eq: telegramUserId } },
            { day: { _eq: day } },
            { year: { _eq: currentYear } }
          ]
        }
      })
    );

    if (count === 0 && existingRecords.length > 0) {
      // Удаляем все записи для этого дня в текущем году
      for (const record of existingRecords) {
        await adminClient.request(deleteItem('reading', (record as any).id));
      }
      return { updateProgress: { day, count: 0, completedItems: null, success: true } };
    }

    if (count === null) {
      // Помечаем весь день как прочитанный
      if (existingRecords.length > 0) {
        // Обновляем первую запись
        await adminClient.request(
          updateItem('reading', (existingRecords[0] as any).id, {
            count: null,
            completed_items: null,
            year: currentYear
          })
        );
        // Удаляем остальные
        for (let i = 1; i < existingRecords.length; i++) {
          await adminClient.request(deleteItem('reading', (existingRecords[i] as any).id));
        }
      } else {
        // Создаем новую запись
        await adminClient.request(
          createItem('reading', {
            user_id: telegramUserId,
            day,
            count: null,
            completed_items: null,
            year: currentYear
          })
        );
      }
      return { updateProgress: { day, count: null, completedItems: null, success: true } };
    }

    // Обновляем частичный прогресс
    const updateData: any = {
      count,
      year: currentYear
    };

    // Добавляем completed_items если передан массив
    if (completedItems && Array.isArray(completedItems)) {
      updateData.completed_items = completedItems;
    }

    if (existingRecords.length > 0) {
      await adminClient.request(
        updateItem('reading', (existingRecords[0] as any).id, updateData)
      );
    } else {
      await adminClient.request(
        createItem('reading', {
          user_id: telegramUserId,
          day,
          ...updateData
        })
      );
    }

    return { updateProgress: { day, count, completedItems: completedItems || null, success: true } };
  }

  throw new Error('Unknown mutation');
}

async function executeQuery(
  adminClient: DirectusAdminClient,
  telegramUserId: number,
  query: string,
  variables?: any
) {
  // Парсим имя операции из GraphQL запроса
  const queryMatch = query.match(/query\s+(\w+)/);
  const operationName = queryMatch ? queryMatch[1] : '';
  
  // Получение прогресса для конкретного дня
  if (operationName === 'GetDayProgress' || query.includes('getDayProgress')) {
    const { day } = variables || {};
    const currentYear = new Date().getFullYear();
    
    // @ts-ignore - Directus SDK typing issue with custom schema
    const records = await adminClient.request(
      readItems('reading', {
        filter: {
          _and: [
            { user_id: { _eq: telegramUserId } },
            { day: { _eq: day } },
            { year: { _eq: currentYear } }
          ]
        }
      })
    );

    if (records.length === 0) {
      return { getDayProgress: { day, count: null } };
    }

    // Берем последнюю запись
    const latest = records[records.length - 1] as any;
    return { getDayProgress: { day, count: latest.count } };
  }

  throw new Error('Unknown query');
}

