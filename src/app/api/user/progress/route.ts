import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getUserProgress, updateUserProgress } from '@/lib/directus-data';

/**
 * GET /api/user/progress
 * Получает прогресс чтения текущего пользователя
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const progress = await getUserProgress(session.directus_id);

    return NextResponse.json({ progress });
  } catch (error) {
    console.error('Error getting user progress:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/user/progress
 * Обновляет прогресс чтения текущего пользователя
 * 
 * Request body:
 * {
 *   "day": 1,
 *   "count": 2 | null  // null означает весь день прочитан
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { day, count } = await request.json();

    if (typeof day !== 'number') {
      return NextResponse.json({ error: 'Invalid day parameter' }, { status: 400 });
    }

    if (count !== null && typeof count !== 'number') {
      return NextResponse.json({ error: 'Invalid count parameter' }, { status: 400 });
    }

    console.log('POST /api/user/progress: updating progress', {
      day,
      count,
      directusUserId: session.directus_id
    });

    await updateUserProgress(session.directus_id, day, count);

    console.log('POST /api/user/progress: progress updated successfully', {
      day,
      count
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user progress:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

