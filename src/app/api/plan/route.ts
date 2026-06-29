import { NextResponse } from 'next/server';
import { getReadingPlan } from '@/lib/directus-data';

/**
 * GET /api/plan
 * Получает план чтения через admin-клиент (T6: без зависимости от user access_token).
 */
export async function GET() {
  try {
    const plan = await getReadingPlan();
    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Error getting plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

