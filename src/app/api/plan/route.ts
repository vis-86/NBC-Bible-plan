import { NextRequest, NextResponse } from 'next/server';
import { getReadingPlan } from '@/lib/directus-data';

/**
 * GET /api/plan
 * Получает план чтения
 */
export async function GET(request: NextRequest) {
  try {
    const plan = await getReadingPlan();
    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Error getting plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

