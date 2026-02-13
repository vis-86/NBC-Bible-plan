import { NextRequest, NextResponse } from 'next/server';
import { getSession, deleteSession, isTokenExpiredError } from '@/lib/session';
import { getWeeklyPlanItems } from '@/lib/directus-data';

export type WeeklyPlanItem = {
  id: string;
  numbers: number;
  item: number;
  read: string;
};

export type WeeklyPlanWeek = {
  week: number;
  items: WeeklyPlanItem[];
};

/**
 * GET /api/plan/weekly?book=proverbs
 * Возвращает недельный план (1..52) по выбранной книге.
 * Использует токен пользователя из сессии, если есть (после входа по логину/паролю).
 */
export async function GET(request: NextRequest) {
  try {
    const book = request.nextUrl.searchParams.get('book') || 'proverbs';
    const session = await getSession();
    const userToken = session?.access_token;

    const rawItems = await getWeeklyPlanItems(book, userToken);
    // Directus SDK typings are intentionally relaxed in this codebase.
    const items = rawItems as unknown as WeeklyPlanItem[];

    const map = new Map<number, WeeklyPlanWeek>();
    for (const it of items) {
      const week = Number(it.numbers);
      if (!map.has(week)) map.set(week, { week, items: [] });
      map.get(week)!.items.push(it);
    }

    const weeks = Array.from(map.values()).sort((a, b) => a.week - b.week);
    for (const w of weeks) {
      w.items.sort((a, b) => a.item - b.item);
    }

    return NextResponse.json({ book, weeks });
  } catch (error) {
    if (isTokenExpiredError(error)) {
      const res = NextResponse.json({ error: 'Session expired' }, { status: 401 });
      return deleteSession(res);
    }
    console.error('Error getting weekly plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

