/**
 * Порт группы plan из src/app/api/plan/* (1:1 по поведению).
 */
import { Hono } from 'hono';
import { getReadingPlan, getWeeklyPlanItems } from '../../../src/lib/directus-data';
import { logger } from '../logger';

type WeeklyPlanItem = {
  id: string;
  numbers: number;
  item: number;
  read: string;
};

type WeeklyPlanWeek = {
  week: number;
  items: WeeklyPlanItem[];
};

export const planRoutes = new Hono();

/**
 * GET /plan — план чтения через admin-клиент.
 */
planRoutes.get('/', async (c) => {
  try {
    const plan = await getReadingPlan();
    return c.json({ plan });
  } catch (error) {
    logger.error('Error getting plan:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /plan/weekly?book=proverbs — недельный план (1..52) по книге.
 */
planRoutes.get('/weekly', async (c) => {
  try {
    const book = c.req.query('book') || 'proverbs';

    const rawItems = await getWeeklyPlanItems(book);
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

    logger.debug(`plan weekly: book=${book} weeks=${weeks.length}`);
    return c.json({ book, weeks });
  } catch (error) {
    logger.error('Error getting weekly plan:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
