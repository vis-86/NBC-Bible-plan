import { ReadingPlanDay, PlanItem } from '@/types';

/**
 * Решение для нажатия ✓ (последний элемент дня в ридере): показывать ли
 * поздравление о завершении дня.
 *
 * true, если после отметки текущей главы день полностью завершён — включая
 * случай, когда все главы (в т.ч. текущая) УЖЕ были отмечены ранее (чтение не
 * по порядку / повторное ✓). Раньше этот случай молча терялся: показ модалки
 * зависел от перехода day.completed false→true, которого не происходило.
 */
export function shouldShowCompletionOnCheck(
  day: ReadingPlanDay | null | undefined,
  currentItem: PlanItem | null | undefined
): boolean {
  if (!day || !day.items || day.items.length === 0) return false;
  return day.items.every((i) => i.completed || i.item === currentItem?.item);
}
