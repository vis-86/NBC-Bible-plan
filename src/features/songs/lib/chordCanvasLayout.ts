/**
 * Геометрия холста «Аккорды» (M9, T3b) — чистые функции над уже измеренными точками.
 * Измерение (DOM Range) живёт в компоненте; здесь только решения, которые можно
 * проверить тестом без браузера.
 */

/** Точка вставки перед символом `pos` в координатах строки. */
export interface CaretPoint {
  pos: number;
  x: number;
  /** Верх глифа — у переносимой строки у каждого визуального ряда свой. */
  top: number;
  height: number;
}

/** Порог «тот же визуальный ряд»: субпиксельная разница у глифов одного ряда. */
const SAME_ROW_PX = 2;

/**
 * Точка вставки, ближайшая к тапу: сначала ближайший по вертикали ряд, потом
 * ближайшая по горизонтали граница символа в нём. Сумма расстояний с весом
 * промахивалась бы на соседний ряд у края переносимой строки.
 */
export function nearestCaretPoint(points: CaretPoint[], x: number, y: number): CaretPoint | null {
  if (points.length === 0) return null;
  let rowTop = points[0].top;
  let rowDistance = Infinity;
  for (const p of points) {
    const distance = Math.abs(p.top + p.height / 2 - y);
    if (distance < rowDistance) {
      rowDistance = distance;
      rowTop = p.top;
    }
  }
  let best: CaretPoint | null = null;
  for (const p of points) {
    if (Math.abs(p.top - rowTop) > SAME_ROW_PX) continue;
    if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  }
  return best;
}

export interface ChipBox {
  x: number;
  top: number;
  width: number;
}

/**
 * Левые края аккордов после раздвигания: соседние аккорды одного ряда не налезают
 * друг на друга (`[C]о[G]н` — две буквы шириной меньше, чем `C` и `G`). Порядок —
 * порядок аккордов в строке, поэтому сдвиг только вправо.
 */
export function resolveChipOverlaps(chips: ChipBox[], gap = 3): number[] {
  const lefts: number[] = [];
  chips.forEach((chip, i) => {
    const prev = chips[i - 1];
    const sameRow = prev !== undefined && Math.abs(prev.top - chip.top) <= SAME_ROW_PX;
    lefts.push(sameRow ? Math.max(chip.x, lefts[i - 1] + prev.width + gap) : chip.x);
  });
  return lefts;
}

/**
 * Резиновый край: за границей `[min, max]` элемент идёт за пальцем всё медленнее,
 * но идёт — жёсткий упор ощущается как зависание. Формула — классическая
 * rubber-band из UIScrollView: `(over·dim·c) / (dim + c·over)`.
 */
export function rubberBand(value: number, min: number, max: number, dimension: number, c = 0.55): number {
  const band = (over: number) => (over * dimension * c) / (dimension + c * over);
  if (value < min) return min - band(min - value);
  if (value > max) return max + band(value - max);
  return value;
}

export interface SpringOptions {
  /** Жёсткость, 1/с². */
  stiffness?: number;
  /** Демпфирование, 1/с. Критическое — `2·√stiffness`; меньше — лёгкий перелёт. */
  damping?: number;
  /** Шаг интегрирования = кадр. */
  frameMs?: number;
  /** Страховка от бесконечного колебания при кривых параметрах. */
  maxFrames?: number;
}

/**
 * Смещения по кадрам для посадки аккорда: из `offset` (где его отпустили относительно
 * нового места) в 0, с начальной скоростью отпускания. Скорость НЕ проецирует цель
 * (решено в плане M9: расстановка — точная задача), она только убирает шов между
 * пальцем и анимацией. Последний кадр всегда 0.
 */
export function springFrames(offset: number, velocity: number, options: SpringOptions = {}): number[] {
  const { stiffness = 400, damping = 34, frameMs = 1000 / 60, maxFrames = 90 } = options;
  const dt = frameMs / 1000;
  const frames: number[] = [offset];
  let x = offset;
  let v = velocity;
  for (let i = 0; i < maxFrames; i++) {
    // Полунеявный Эйлер: устойчив на шаге кадра, в отличие от явного.
    v += (-stiffness * x - damping * v) * dt;
    x += v * dt;
    if (Math.abs(x) < 0.5 && Math.abs(v) < 20) break;
    frames.push(x);
  }
  frames.push(0);
  return frames;
}
