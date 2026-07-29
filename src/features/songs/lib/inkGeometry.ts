/**
 * Геометрия рукописных пометок (M10, §6): перевод координат между слоем рисования и
 * якорной строкой песни, поиск ближайшей строки и hit-test для ластика.
 *
 * Все функции чистые — DOM трогает только `collectLineRects`. Так геометрия
 * тестируется без браузера, а слой остаётся тонким.
 */
import type { SongStroke } from '../types';
import { readSongLineAnchor, SONG_LINE_SELECTOR } from './inkAnchor';

/** Точка в координатах слоя рисования (px от левого верхнего угла слоя). */
export interface LayerPoint {
  x: number;
  y: number;
  pressure: number;
}

/** Bounding box одной якорной строки в координатах слоя. */
export interface LineRect {
  section: number;
  line: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Быстрый доступ к строке по якорю. */
export type LineRectIndex = Map<string, LineRect>;

export function anchorKey(section: number, line: number): string {
  return `${section}:${line}`;
}

export function indexLineRects(rects: LineRect[]): LineRectIndex {
  return new Map(rects.map((rect) => [anchorKey(rect.section, rect.line), rect]));
}

/**
 * Bounding box'ы всех якорных строк ВНУТРИ переданного корня.
 *
 * Корень обязателен и обязан быть своим листом: в режиме `sheets` на экране N клонов
 * одного потока, и поиск по документу вернул бы строку первого листа — все пометки
 * съехали бы на первую страницу.
 */
export function collectLineRects(
  root: Element,
  origin: { left: number; top: number },
  /** Текущий `transform: scale` слоя: `getBoundingClientRect` отдаёт УЖЕ масштабированные
   *  px, а геометрия пометок хранится в нескалированных координатах слоя. */
  scale = 1
): LineRect[] {
  const rects: LineRect[] = [];
  const k = scale || 1;
  for (const el of root.querySelectorAll(SONG_LINE_SELECTOR)) {
    const anchor = readSongLineAnchor(el);
    if (!anchor) continue;
    const box = el.getBoundingClientRect();
    // Схлопнутые строки (режим `sheets` прячет источник разбивки) — не якоря.
    if (box.width === 0 && box.height === 0) continue;
    rects.push({
      section: anchor.section,
      line: anchor.line,
      x: (box.left - origin.left) / k,
      y: (box.top - origin.top) / k,
      width: box.width / k,
      height: box.height / k,
    });
  }
  return rects;
}

/** Координаты слоя → координаты относительно строки-якоря. */
export function toAnchored(point: LayerPoint, rect: LineRect): [number, number, number] {
  return [point.x - rect.x, point.y - rect.y, point.pressure];
}

/**
 * Координаты штриха → координаты слоя. `null` — строки-якоря сейчас нет на экране
 * (песню перерисовали в другой раскладке / строка исчезла): штрих просто не рендерится.
 */
export function toAbsolute(stroke: SongStroke, rects: LineRectIndex): Array<[number, number, number]> | null {
  const rect = rects.get(anchorKey(stroke.anchor.section, stroke.anchor.line));
  if (!rect) return null;
  return stroke.points.map(([x, y, pressure]) => [x + rect.x, y + rect.y, pressure]);
}

/**
 * Ближайшая к точке строка. Внутри строки расстояние равно нулю, поэтому попадание
 * «в строку» всегда выигрывает у соседей. `null` — якорных строк нет вовсе.
 */
export function nearestLine(point: { x: number; y: number }, rects: LineRect[]): LineRect | null {
  let best: LineRect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const rect of rects) {
    const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
    const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
    // Вертикаль весомее: строки узкие и длинные, и «та же строка левее» ближе по смыслу,
    // чем «строка выше на том же месте».
    const distance = Math.hypot(dx * 0.35, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = rect;
    }
  }
  return best;
}

/** Расстояние от точки до ОТРЕЗКА (не до его концов). */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSq));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/**
 * Попал ли ластик по штриху. Считаем расстояние до ОТРЕЗКОВ, а не до точек: у стрелки
 * точек всего две, и по расстоянию до точек середина древка не стиралась бы вовсе.
 * Заодно это чинит стирание длинных прямых участков обычного штриха.
 *
 * `points` — уже в координатах слоя (`toAbsolute`).
 */
export function hitTestStroke(
  points: Array<[number, number, number]>,
  strokeWidth: number,
  point: { x: number; y: number },
  tolerance: number
): boolean {
  const reach = strokeWidth / 2 + tolerance;
  if (points.length === 1) {
    return Math.hypot(point.x - points[0][0], point.y - points[0][1]) <= reach;
  }
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    if (distanceToSegment(point.x, point.y, ax, ay, bx, by) <= reach) return true;
  }
  return false;
}

/** Габариты набора точек — нужны для рамки выделенной текстовой заметки и клипа. */
export function pointsBounds(points: Array<[number, number, number]>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
