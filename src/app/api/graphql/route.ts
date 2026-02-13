// @ts-nocheck - Directus SDK typing issue with custom schema
import { NextRequest, NextResponse } from 'next/server';
import { getSession, deleteSession, isTokenExpiredError } from '@/lib/session';
import { getDirectusAdminClient, getDirectusUserClient } from '@/lib/directus';

type DirectusClient = ReturnType<typeof getDirectusAdminClient>;
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

    const client: DirectusClient = session.access_token
      ? getDirectusUserClient(session.access_token)
      : getDirectusAdminClient();

    const result = await executeGraphQLQuery(client, session.directus_id, query, variables);

    return NextResponse.json({ data: result });
  } catch (error: any) {
    if (isTokenExpiredError(error)) {
      const res = NextResponse.json({ error: 'Session expired' }, { status: 401 });
      return deleteSession(res);
    }
    console.error('GraphQL error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function executeGraphQLQuery(
  client: DirectusClient,
  directusUserId: string,
  query: string,
  variables?: any
) {
  const isMutation = query.trim().startsWith('mutation');

  if (isMutation) {
    return await executeMutation(client, directusUserId, query, variables);
  } else {
    return await executeQuery(client, directusUserId, query, variables);
  }
}

async function executeMutation(
  client: DirectusClient,
  directusUserId: string,
  query: string,
  variables?: any
) {
  const mutationMatch = query.match(/mutation\s+(\w+)/);
  const operationName = mutationMatch ? mutationMatch[1] : '';

  if (operationName === 'UpdateProgress' || query.includes('updateProgress')) {
    const { day, count, completedItems } = variables || {};

    if (typeof day !== 'number') {
      throw new Error('Invalid day parameter');
    }

    if (count !== null && typeof count !== 'number') {
      throw new Error('Invalid count parameter');
    }

    const currentYear = new Date().getFullYear();

    const existingRecords = await client.request(
      readItems('reading', {
        filter: {
          _and: [
            { directus_user_id: { _eq: directusUserId } },
            { day: { _eq: day } },
            { year: { _eq: currentYear } }
          ]
        }
      })
    );

    if (count === 0 && existingRecords.length > 0) {
      for (const record of existingRecords) {
        await client.request(deleteItem('reading', (record as any).id));
      }
      return { updateProgress: { day, count: 0, completedItems: null, success: true } };
    }

    if (count === null) {
      if (existingRecords.length > 0) {
        await client.request(
          updateItem('reading', (existingRecords[0] as any).id, {
            count: null,
            completed_items: null,
            year: currentYear
          })
        );
        for (let i = 1; i < existingRecords.length; i++) {
          await client.request(deleteItem('reading', (existingRecords[i] as any).id));
        }
      } else {
        await client.request(
          createItem('reading', {
            directus_user_id: directusUserId,
            day,
            count: null,
            completed_items: null,
            year: currentYear
          })
        );
      }
      return { updateProgress: { day, count: null, completedItems: null, success: true } };
    }

    const updateData: any = {
      count,
      year: currentYear
    };

    if (completedItems && Array.isArray(completedItems)) {
      updateData.completed_items = completedItems;
    }

    if (existingRecords.length > 0) {
      await client.request(
        updateItem('reading', (existingRecords[0] as any).id, updateData)
      );
    } else {
      await client.request(
        createItem('reading', {
          directus_user_id: directusUserId,
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
  client: DirectusClient,
  directusUserId: string,
  query: string,
  variables?: any
) {
  const queryMatch = query.match(/query\s+(\w+)/);
  const operationName = queryMatch ? queryMatch[1] : '';

  if (operationName === 'GetDayProgress' || query.includes('getDayProgress')) {
    const { day } = variables || {};
    const currentYear = new Date().getFullYear();

    const records = await client.request(
      readItems('reading', {
        filter: {
          _and: [
            { directus_user_id: { _eq: directusUserId } },
            { day: { _eq: day } },
            { year: { _eq: currentYear } }
          ]
        }
      })
    );

    if (records.length === 0) {
      return { getDayProgress: { day, count: null } };
    }

    const latest = records[records.length - 1] as any;
    return { getDayProgress: { day, count: latest.count } };
  }

  throw new Error('Unknown query');
}

