import { describe, expect, it } from 'vitest';
import { arrowOutline, freehandOutline, strokeOutline, type OutlinePoint } from './inkStroke';

/** Толщина горизонтального штриха = вертикальный размер его контура. */
function outlineHeight(outline: OutlinePoint[]): number {
  const ys = outline.map(([, y]) => y);
  return Math.max(...ys) - Math.min(...ys);
}

function horizontal(pressure: number, length = 10): Array<[number, number, number]> {
  return Array.from({ length }, (_, i) => [i * 10, 0, pressure] as [number, number, number]);
}

describe('freehandOutline', () => {
  it('одна точка даёт непустой контур (точка-клякса, а не пустота)', () => {
    expect(freehandOutline([[10, 10, 0.5]], 'pen', 6).length).toBeGreaterThan(0);
  });

  it('N точек дают непустой контур', () => {
    expect(freehandOutline(horizontal(0.5), 'pen', 6).length).toBeGreaterThan(2);
  });

  it('пустой ввод не роняет рендер', () => {
    expect(freehandOutline([], 'pen', 6)).toEqual([]);
  });

  it('перо: толщина растёт с нажимом', () => {
    const light = outlineHeight(freehandOutline(horizontal(0.15), 'pen', 12));
    const heavy = outlineHeight(freehandOutline(horizontal(0.95), 'pen', 12));
    expect(heavy).toBeGreaterThan(light);
  });

  it('маркер: толщина от нажима НЕ зависит', () => {
    const light = outlineHeight(freehandOutline(horizontal(0.15), 'highlighter', 12));
    const heavy = outlineHeight(freehandOutline(horizontal(0.95), 'highlighter', 12));
    expect(heavy).toBeCloseTo(light, 5);
  });
});

describe('arrowOutline', () => {
  const arrow = (bx: number, by: number, width = 6) =>
    arrowOutline(
      [
        [0, 0, 0.5],
        [bx, by, 0.5],
      ],
      width
    );

  it('один замкнутый полигон из 7 вершин (древко и наконечник вместе)', () => {
    expect(arrow(100, 0)).toHaveLength(7);
  });

  it('остриё лежит ровно в конечной точке', () => {
    const outline = arrow(100, 0);
    expect(outline[3]).toEqual([100, 0]);
  });

  it('наконечник шире древка', () => {
    const outline = arrow(100, 0, 6);
    const headHalf = Math.abs(outline[2][1]);
    const shaftHalf = Math.abs(outline[1][1]);
    expect(headHalf).toBeGreaterThan(shaftHalf);
  });

  it('короткая стрелка: наконечник не длиннее половины стрелки', () => {
    const length = 20;
    const outline = arrow(length, 0, 6);
    const baseX = outline[2][0];
    expect(length - baseX).toBeLessThanOrEqual(length / 2 + 1e-9);
  });

  it('тап без протяжки не создаёт геометрию', () => {
    expect(arrow(0, 0)).toEqual([]);
    expect(arrowOutline([[0, 0, 0.5]], 6)).toEqual([]);
  });

  it('работает под любым углом (диагональ)', () => {
    const outline = arrow(70, 70);
    expect(outline).toHaveLength(7);
    expect(outline[3]).toEqual([70, 70]);
  });
});

describe('strokeOutline', () => {
  it('текстовая заметка на canvas не рисуется — она живёт в DOM', () => {
    expect(strokeOutline([[0, 0, 1]], 'text', 6)).toEqual([]);
  });

  it('стрелка идёт своей геометрией, а не freehand', () => {
    expect(
      strokeOutline(
        [
          [0, 0, 0.5],
          [100, 0, 0.5],
        ],
        'arrow',
        6
      )
    ).toHaveLength(7);
  });
});
