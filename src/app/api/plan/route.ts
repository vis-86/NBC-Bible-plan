import { NextRequest, NextResponse } from 'next/server';
import { getSession, deleteSession, isTokenExpiredError } from '@/lib/session';
import { getReadingPlan } from '@/lib/directus-data';

/**
 * GET /api/plan
 * Получает план чтения. Использует токен пользователя из сессии, если есть.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const plan = await getReadingPlan(session?.access_token);
    return NextResponse.json({ plan });
  } catch (error) {
    if (isTokenExpiredError(error)) {
      const res = NextResponse.json({ error: 'Session expired' }, { status: 401 });
      return deleteSession(res);
    }
    console.error('Error getting plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

