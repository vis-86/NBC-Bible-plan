import { describe, expect, it } from 'vitest';
import { nearestCaretPoint, resolveChipOverlaps, rubberBand, springFrames, type CaretPoint } from './chordCanvasLayout';

// Две визуальные строки переносимой строки текста: ряд 0 (top 20) и ряд 1 (top 74).
const POINTS: CaretPoint[] = [
  { pos: 0, x: 0, top: 20, height: 20 },
  { pos: 1, x: 10, top: 20, height: 20 },
  { pos: 2, x: 200, top: 20, height: 20 },
  { pos: 3, x: 0, top: 74, height: 20 },
  { pos: 4, x: 10, top: 74, height: 20 },
];

describe('nearestCaretPoint', () => {
  it('ближайшая граница символа в ряду', () => {
    expect(nearestCaretPoint(POINTS, 8, 30)?.pos).toBe(1);
  });

  it('у края ряда не перескакивает на соседний ряд', () => {
    // По сумме расстояний pos 3 (x 0, ряд ниже) был бы ближе, чем pos 2 (x 200).
    expect(nearestCaretPoint(POINTS, 150, 25)?.pos).toBe(2);
  });

  it('тап в зоне аккордов над вторым рядом выбирает второй ряд', () => {
    expect(nearestCaretPoint(POINTS, 9, 70)?.pos).toBe(4);
  });

  it('без точек — null', () => {
    expect(nearestCaretPoint([], 0, 0)).toBeNull();
  });
});

describe('resolveChipOverlaps', () => {
  it('раздвигает соседей одного ряда', () => {
    expect(
      resolveChipOverlaps([
        { x: 0, top: 0, width: 20 },
        { x: 5, top: 0, width: 20 },
        { x: 100, top: 0, width: 20 },
      ])
    ).toEqual([0, 23, 100]);
  });

  it('аккорды разных рядов не толкают друг друга', () => {
    expect(
      resolveChipOverlaps([
        { x: 50, top: 0, width: 40 },
        { x: 0, top: 54, width: 20 },
      ])
    ).toEqual([50, 0]);
  });
});

describe('rubberBand', () => {
  it('внутри границ — как есть', () => {
    expect(rubberBand(50, 0, 100, 300)).toBe(50);
  });

  it('за границей идёт медленнее пальца, но идёт', () => {
    const over = rubberBand(160, 0, 100, 300);
    expect(over).toBeGreaterThan(100);
    expect(over).toBeLessThan(160);
    expect(rubberBand(-60, 0, 100, 300)).toBeCloseTo(-(over - 100), 5);
  });
});

describe('springFrames', () => {
  it('приходит в 0 и не зацикливается', () => {
    const frames = springFrames(80, 0);
    expect(frames[0]).toBe(80);
    expect(frames[frames.length - 1]).toBe(0);
    expect(frames.length).toBeLessThan(92);
  });

  it('скорость отпускания продолжает движение, а не обрывается', () => {
    // Отпустили на 20px левее нового места, но рука двигалась влево: первый кадр уходит дальше влево.
    const frames = springFrames(-20, -600);
    expect(frames[1]).toBeLessThan(-20);
    expect(frames[frames.length - 1]).toBe(0);
  });
});
