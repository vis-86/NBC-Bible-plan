// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChapterNavigation } from './useChapterNavigation';
import type { ReadingPlanDay, PlanItem } from '@/types';

const item1 = { id: 1, item: 1, readText: 'Исаия 7', completed: false } as PlanItem;
const item2 = { id: 2, item: 2, readText: 'Исаия 8', completed: false } as PlanItem;
const item3 = { id: 3, item: 3, readText: 'Псалтирь 91', completed: false } as PlanItem;

function makeDay(items: PlanItem[]): ReadingPlanDay {
  return { id: 187, completed: false, items } as unknown as ReadingPlanDay;
}

describe('useChapterNavigation', () => {
  it('навигация ‹ › внутри дня: refetch плана (day.items) не перезатирает только что установленный currentItem', () => {
    // Сценарий бага: нажатие › отмечает item 1 (toggleItem → refetch плана) и
    // навигирует на item 2. Обновлённый day.items (item 1 completed) приходил
    // ВМЕСТЕ со сменой currentItem — эффект освежения полей со stale-замыканием
    // возвращал currentItemState обратно на item 1, и следующее › вело на уже
    // открытый item 2 (визуально «стрелка не работает»).
    const onNavigateChapter = vi.fn();
    const { result, rerender } = renderHook(
      ({ day, currentItem, currentReading }) =>
        useChapterNavigation({ currentReading, day, currentItem, onNavigateChapter }),
      {
        initialProps: {
          day: makeDay([item1, item2, item3]),
          currentItem: item1,
          currentReading: { book: 'Исаия', chapter: 7 },
        },
      }
    );

    // Одновременно: новый currentItem (item 2) + обновлённые day.items (item 1 отмечен).
    const item1Done = { ...item1, completed: true } as PlanItem;
    rerender({
      day: makeDay([item1Done, item2, item3]),
      currentItem: item2,
      currentReading: { book: 'Исаия', chapter: 8 },
    });

    expect(result.current.currentItemState?.item).toBe(2);

    // Следующее › должно вести на item 3, а не на item 2 повторно.
    act(() => result.current.handleNextChapter());
    expect(onNavigateChapter).toHaveBeenCalledWith('Псалтирь', 91, 187, 3);
  });

  it('обновление полей текущего item из day.items (completed после toggleItem) подхватывается', () => {
    // currentReading вынесен наружу и передаётся как стабильная ссылка: инлайн-объект
    // в рендер-функции создавался бы заново на каждый рендер, эффект по [currentReading]
    // тогда гонялся бы бесконечно (setState на новую ссылку → ре-рендер → новый объект → ...).
    const stableReading = { book: 'Исаия', chapter: 7 };
    const { result, rerender } = renderHook(
      ({ day, currentItem }) =>
        useChapterNavigation({
          currentReading: stableReading,
          day,
          currentItem,
        }),
      { initialProps: { day: makeDay([item1, item2]), currentItem: item1 } }
    );

    expect(result.current.currentItemState?.completed).toBe(false);

    // Refetch плана: тот же item, но completed=true; currentItem prop не меняется.
    const item1Done = { ...item1, completed: true } as PlanItem;
    rerender({ day: makeDay([item1Done, item2]), currentItem: item1 });

    expect(result.current.currentItemState?.completed).toBe(true);
  });
});
