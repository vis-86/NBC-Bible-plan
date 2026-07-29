/**
 * Движок рисования штриха (M10, §6): точки → замкнутый контур → один `fill()`.
 *
 * Один `fill()` на штрих — обязательное требование, а не оптимизация. У полупрозрачного
 * маркера несколько заливок темнят самопересечения, а разнонаправленные субпути гасят
 * друг друга по правилу nonzero и дают пунктир вместо линии (наступили в прототипе).
 */
import getStroke from 'perfect-freehand';
import type { SongInkTool, SongStroke } from '../types';

/** Точка контура: [x, y]. */
export type OutlinePoint = number[];

/** Прозрачность маркера — та же величина, что у бумажного текстовыделителя. */
export const HIGHLIGHTER_ALPHA = 0.35;

/** Насколько ластик «шире» самого штриха при попадании (px). */
export const ERASER_TOLERANCE = 8;

const PEN_OPTIONS = { thinning: 0.55, smoothing: 0.55, streamline: 0.45 };
const HIGHLIGHTER_OPTIONS = { thinning: 0, smoothing: 0.4, streamline: 0.5 };

/**
 * У пальца и мыши браузер отдаёт константное `pressure = 0.5`. В этом случае
 * `perfect-freehand` должен симулировать нажим по скорости, иначе `thinning` не даёт
 * ничего и перо выглядит как маркер.
 */
function hasRealPressure(points: Array<[number, number, number]>): boolean {
  if (points.length < 2) return false;
  const first = points[0][2];
  return points.some((p) => Math.abs(p[2] - first) > 0.01);
}

/**
 * Контур штриха пера/маркера. Возвращает ОДИН замкнутый полигон.
 * Пустой массив — рисовать нечего (не должно ронять рендер).
 */
export function freehandOutline(
  points: Array<[number, number, number]>,
  tool: SongInkTool,
  width: number
): OutlinePoint[] {
  if (points.length === 0) return [];
  const base = tool === 'highlighter' ? HIGHLIGHTER_OPTIONS : PEN_OPTIONS;
  return getStroke(points, {
    ...base,
    size: width,
    simulatePressure: tool === 'pen' && !hasRealPressure(points),
    last: true,
  });
}

/**
 * Контур стрелки — ОДИН замкнутый полигон (древко и наконечник вместе).
 * «Прямоугольник плюс треугольник» двумя субпутями даёт дыру на стыке, ровно как
 * наивно собранный штрих.
 *
 * Пустой массив — вырожденная стрелка (тап без протяжки): такую не рисуем и не пишем,
 * иначе на листе копятся невидимые штрихи из одной точки.
 */
export function arrowOutline(points: Array<[number, number, number]>, width: number): OutlinePoint[] {
  if (points.length < 2) return [];
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];

  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length < width) return [];

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;

  // Наконечник ограничен половиной длины — иначе короткая стрелка вырождается в клин.
  const headLength = Math.min(width * 3.2, length * 0.5);
  const headHalf = width * 1.7;
  const shaftHalf = width / 2;

  const cx = bx - ux * headLength;
  const cy = by - uy * headLength;

  return [
    [ax + nx * shaftHalf, ay + ny * shaftHalf],
    [cx + nx * shaftHalf, cy + ny * shaftHalf],
    [cx + nx * headHalf, cy + ny * headHalf],
    [bx, by],
    [cx - nx * headHalf, cy - ny * headHalf],
    [cx - nx * shaftHalf, cy - ny * shaftHalf],
    [ax - nx * shaftHalf, ay - ny * shaftHalf],
  ];
}

/** Контур любого рисуемого на canvas инструмента. `text` живёт в DOM и сюда не попадает. */
export function strokeOutline(
  points: Array<[number, number, number]>,
  tool: SongInkTool,
  width: number
): OutlinePoint[] {
  if (tool === 'arrow') return arrowOutline(points, width);
  if (tool === 'text') return [];
  return freehandOutline(points, tool, width);
}

/** Замкнутый `Path2D` по контуру. Сглаживание — по средним точкам соседних вершин. */
export function outlineToPath(outline: OutlinePoint[]): Path2D {
  const path = new Path2D();
  if (outline.length === 0) return path;
  if (outline.length < 3) {
    path.moveTo(outline[0][0], outline[0][1]);
    for (const [x, y] of outline.slice(1)) path.lineTo(x, y);
    path.closePath();
    return path;
  }

  const [firstX, firstY] = outline[0];
  const [lastX, lastY] = outline[outline.length - 1];
  path.moveTo((lastX + firstX) / 2, (lastY + firstY) / 2);
  for (let i = 0; i < outline.length; i++) {
    const [x, y] = outline[i];
    const [nx, ny] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  path.closePath();
  return path;
}

/**
 * Отрисовка одного штриха. Состояние контекста сохраняется/восстанавливается здесь же:
 * `multiply` маркера, протёкший на следующий штрих, красит перо в грязь.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Pick<SongStroke, 'tool' | 'color' | 'width'>,
  points: Array<[number, number, number]>
): void {
  const outline = strokeOutline(points, stroke.tool, stroke.width);
  if (outline.length === 0) return;

  ctx.save();
  if (stroke.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
  }
  ctx.fillStyle = stroke.color;
  ctx.fill(outlineToPath(outline));
  ctx.restore();
}
