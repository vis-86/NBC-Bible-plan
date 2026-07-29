// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  anchorKey,
  collectLineRects,
  distanceToSegment,
  hitTestStroke,
  indexLineRects,
  nearestLine,
  pointsBounds,
  toAbsolute,
  toAnchored,
  type LineRect,
} from './inkGeometry';
import { SONG_LINE_INDEX_ATTR, SONG_LINE_SECTION_ATTR } from './inkAnchor';
import type { SongStroke } from '../types';

function rect(section: number, line: number, x: number, y: number, width = 200, height = 20): LineRect {
  return { section, line, x, y, width, height };
}

function stroke(points: SongStroke['points'], over: Partial<SongStroke> = {}): SongStroke {
  return {
    id: 's1',
    tool: 'pen',
    anchor: { section: 0, line: 0 },
    points,
    color: '#000',
    width: 4,
    ...over,
  };
}

describe('toAnchored / toAbsolute', () => {
  it('round-trip: якорим и разворачиваем обратно в ту же точку', () => {
    const line = rect(1, 2, 40, 100);
    const anchored = toAnchored({ x: 55, y: 108, pressure: 0.7 }, line);
    expect(anchored).toEqual([15, 8, 0.7]);

    const absolute = toAbsolute(stroke([anchored], { anchor: { section: 1, line: 2 } }), indexLineRects([line]));
    expect(absolute).toEqual([[55, 108, 0.7]]);
  });

  it('строка уехала (сменился шрифт) — штрих едет вместе с ней', () => {
    const anchored = toAnchored({ x: 55, y: 108, pressure: 1 }, rect(0, 0, 40, 100));
    const moved = indexLineRects([rect(0, 0, 40, 260)]);
    expect(toAbsolute(stroke([anchored]), moved)).toEqual([[55, 268, 1]]);
  });

  it('строки-якоря нет — null, а не падение', () => {
    expect(toAbsolute(stroke([[1, 1, 1]], { anchor: { section: 9, line: 9 } }), indexLineRects([rect(0, 0, 0, 0)]))).toBeNull();
  });
});

describe('nearestLine', () => {
  const lines = [rect(0, 0, 0, 0), rect(0, 1, 0, 40), rect(1, 0, 0, 80)];

  it('точка внутри строки выбирает именно её', () => {
    expect(nearestLine({ x: 10, y: 45 }, lines)).toMatchObject({ section: 0, line: 1 });
  });

  it('точка между строками выбирает ближайшую по вертикали', () => {
    expect(nearestLine({ x: 10, y: 35 }, lines)).toMatchObject({ section: 0, line: 1 });
    expect(nearestLine({ x: 10, y: 25 }, lines)).toMatchObject({ section: 0, line: 0 });
  });

  it('точка правее строки всё ещё выбирает её, а не строку ниже', () => {
    expect(nearestLine({ x: 900, y: 45 }, lines)).toMatchObject({ section: 0, line: 1 });
  });

  it('строк нет — null', () => {
    expect(nearestLine({ x: 0, y: 0 }, [])).toBeNull();
  });
});

describe('hitTestStroke', () => {
  it('попадает по СЕРЕДИНЕ длинного отрезка, а не только по концам', () => {
    const points: Array<[number, number, number]> = [
      [0, 0, 1],
      [200, 0, 1],
    ];
    expect(hitTestStroke(points, 4, { x: 100, y: 1 }, 6)).toBe(true);
    expect(hitTestStroke(points, 4, { x: 100, y: 40 }, 6)).toBe(false);
  });

  it('толстый штрих ловится дальше тонкого', () => {
    const points: Array<[number, number, number]> = [
      [0, 0, 1],
      [50, 0, 1],
    ];
    expect(hitTestStroke(points, 40, { x: 25, y: 18 }, 2)).toBe(true);
    expect(hitTestStroke(points, 2, { x: 25, y: 18 }, 2)).toBe(false);
  });

  it('штрих из одной точки', () => {
    expect(hitTestStroke([[10, 10, 1]], 4, { x: 12, y: 12 }, 4)).toBe(true);
    expect(hitTestStroke([[10, 10, 1]], 4, { x: 40, y: 40 }, 4)).toBe(false);
  });
});

describe('distanceToSegment', () => {
  it('вырожденный отрезок = расстояние до точки', () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it('проекция за пределы отрезка обрезается концом', () => {
    expect(distanceToSegment(-10, 0, 0, 0, 10, 0)).toBe(10);
  });
});

describe('collectLineRects', () => {
  it('ищет строки ТОЛЬКО внутри своего корня (режим sheets)', () => {
    document.body.innerHTML = `
      <div id="sheet-1"><span ${SONG_LINE_SECTION_ATTR}="0" ${SONG_LINE_INDEX_ATTR}="0">a</span></div>
      <div id="sheet-2"><span ${SONG_LINE_SECTION_ATTR}="5" ${SONG_LINE_INDEX_ATTR}="1">b</span></div>
    `;
    // jsdom отдаёт нулевые размеры — подменяем измерение, проверяем именно scoping.
    for (const el of document.querySelectorAll('span')) {
      el.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 16 }) as DOMRect;
    }

    const rects = collectLineRects(document.querySelector('#sheet-2')!, { left: 5, top: 5 });
    expect(rects).toEqual([{ section: 5, line: 1, x: 5, y: 15, width: 100, height: 16 }]);
  });

  it('схлопнутые строки (нулевой bbox) якорями не считаются', () => {
    document.body.innerHTML = `<div id="root"><span ${SONG_LINE_SECTION_ATTR}="0" ${SONG_LINE_INDEX_ATTR}="0">a</span></div>`;
    expect(collectLineRects(document.querySelector('#root')!, { left: 0, top: 0 })).toEqual([]);
  });
});

describe('вспомогательное', () => {
  it('anchorKey различает секцию и строку', () => {
    expect(anchorKey(1, 2)).not.toBe(anchorKey(2, 1));
  });

  it('pointsBounds считает габариты', () => {
    expect(
      pointsBounds([
        [10, 20, 1],
        [30, 5, 1],
      ])
    ).toEqual({ x: 10, y: 5, width: 20, height: 15 });
  });
});
