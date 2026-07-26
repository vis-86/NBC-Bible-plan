import { describe, expect, it } from 'vitest';
import { resolveSwipeDirection } from './useHorizontalSwipe';

const VIEWPORT = 400;

describe('resolveSwipeDirection', () => {
  it('нормальный свайп влево/вправо', () => {
    expect(resolveSwipeDirection(200, -100, 0, VIEWPORT)).toBe('left');
    expect(resolveSwipeDirection(200, 100, 0, VIEWPORT)).toBe('right');
  });

  it('короткий свайп (|dx| <= thresholdPx) -> null', () => {
    expect(resolveSwipeDirection(200, 40, 0, VIEWPORT)).toBeNull();
  });

  it('диагональный свайп (|dx| <= ratio * |dy|) -> null', () => {
    expect(resolveSwipeDirection(200, 70, 60, VIEWPORT)).toBeNull();
  });

  it('старт у левого края (<= edgeGuardPx) -> null (системный back-свайп)', () => {
    expect(resolveSwipeDirection(10, -100, 0, VIEWPORT)).toBeNull();
  });

  it('старт у правого края (>= viewportWidth - edgeGuardPx) -> null', () => {
    expect(resolveSwipeDirection(390, -100, 0, VIEWPORT)).toBeNull();
  });

  it('кастомные пороги применяются', () => {
    expect(resolveSwipeDirection(200, 30, 0, VIEWPORT, { thresholdPx: 20 })).toBe('right');
    expect(resolveSwipeDirection(200, 30, 0, VIEWPORT, { thresholdPx: 40 })).toBeNull();
  });
});
