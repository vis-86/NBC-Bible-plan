import { describe, expect, it } from 'vitest';
import { shouldShowCompletionOnCheck } from './completionDecision';
import type { ReadingPlanDay, PlanItem } from '@/types';

function makeDay(items: Array<{ item: number; completed: boolean }>): ReadingPlanDay {
  return { id: 1, completed: items.every((i) => i.completed), items } as unknown as ReadingPlanDay;
}

const item = (n: number): PlanItem => ({ item: n } as unknown as PlanItem);

describe('shouldShowCompletionOnCheck', () => {
  it('✓ на последней незавершённой главе → показать поздравление', () => {
    const day = makeDay([
      { item: 1, completed: true },
      { item: 2, completed: true },
      { item: 3, completed: false },
    ]);
    expect(shouldShowCompletionOnCheck(day, item(3))).toBe(true);
  });

  it('✓ когда все главы уже отмечены (чтение не по порядку / повторное ✓) → показать (регресс бага)', () => {
    const day = makeDay([
      { item: 1, completed: true },
      { item: 2, completed: true },
      { item: 3, completed: true },
    ]);
    expect(shouldShowCompletionOnCheck(day, item(3))).toBe(true);
  });

  it('остались другие непрочитанные главы → не показывать', () => {
    const day = makeDay([
      { item: 1, completed: false },
      { item: 2, completed: true },
      { item: 3, completed: false },
    ]);
    expect(shouldShowCompletionOnCheck(day, item(3))).toBe(false);
  });

  it('без дня или без глав → не показывать', () => {
    expect(shouldShowCompletionOnCheck(null, item(1))).toBe(false);
    expect(shouldShowCompletionOnCheck(makeDay([]), item(1))).toBe(false);
  });

  it('без текущего элемента → решает только фактическая завершённость глав', () => {
    const done = makeDay([{ item: 1, completed: true }]);
    const notDone = makeDay([{ item: 1, completed: false }]);
    expect(shouldShowCompletionOnCheck(done, null)).toBe(true);
    expect(shouldShowCompletionOnCheck(notDone, null)).toBe(false);
  });
});
