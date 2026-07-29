/**
 * Палитра и пресеты инструментов рукописных пометок (M10, §7).
 *
 * ИСКЛЮЧЕНИЕ из правила «только семантические токены»: это цвета ПОЛЬЗОВАТЕЛЬСКОГО
 * контента, а не интерфейса — ровно как `theme-light|dark|sepia` в ридере. Пометка,
 * перекрашенная сменой темы приложения, перестала бы быть той пометкой, которую
 * человек нарисовал.
 */
import type { SongInkTool } from '../types';

/**
 * Сентинел «цвет чернил по теме»: резолвится в `--app-text` в момент отрисовки.
 * Нужен потому, что графитовый штрих на тёмном листе не виден вовсе, а хранить
 * два цвета на пометку — лишняя сущность.
 */
export const INK_COLOR_THEME = 'ink';

/**
 * Восемь цветов фиксированной палитрой, а не color picker'ом: на репетиции цвет выбирают
 * за полсекунды, и оттенок не важен — важно попасть в «красный» с первого тапа (§7).
 */
export const INK_COLORS: ReadonlyArray<{ value: string; label: string; swatch: string }> = [
  { value: INK_COLOR_THEME, label: 'Основной', swatch: 'var(--app-text)' },
  { value: '#dc2626', label: 'Красный', swatch: '#dc2626' },
  { value: '#ea580c', label: 'Оранжевый', swatch: '#ea580c' },
  { value: '#eab308', label: 'Жёлтый', swatch: '#eab308' },
  { value: '#16a34a', label: 'Зелёный', swatch: '#16a34a' },
  { value: '#0284c7', label: 'Синий', swatch: '#0284c7' },
  { value: '#7c3aed', label: 'Фиолетовый', swatch: '#7c3aed' },
  { value: '#db2777', label: 'Розовый', swatch: '#db2777' },
];

/** Инструменты, которыми рисуют (ластик стирает, поэтому в наборе цвета/толщины его нет). */
export const INK_DRAW_TOOLS: readonly SongInkTool[] = ['pen', 'highlighter', 'arrow', 'text'];

/** Диапазон и дефолт толщины на инструмент — маркер заведомо толще пера. */
export const INK_WIDTH_RANGE: Record<SongInkTool, { min: number; max: number; default: number }> = {
  pen: { min: 1, max: 12, default: 3 },
  highlighter: { min: 8, max: 40, default: 18 },
  arrow: { min: 2, max: 14, default: 4 },
  // Для текста «толщина» — это размер шрифта.
  text: { min: 10, max: 32, default: 15 },
};

/**
 * Именованные кегли заметки. Слайдер для текста бесполезен: важно не «17 против 18 px»,
 * а «мелко / обычно / крупно», и на репетиции это выбирают одним тапом, не подгонкой.
 * Значения обязаны лежать в `INK_WIDTH_RANGE.text`.
 */
export const INK_TEXT_SIZES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 12, label: 'Мелкий' },
  { value: 15, label: 'Обычный' },
  { value: 20, label: 'Крупный' },
  { value: 26, label: 'Очень крупный' },
];

/**
 * Ближайший именованный кегль. Нужен для заметок с произвольным размером (набранных
 * слайдером до появления этого списка): без него `<select>` остался бы без значения.
 */
export function nearestTextSize(width: number): number {
  return INK_TEXT_SIZES.reduce((best, option) =>
    Math.abs(option.value - width) < Math.abs(best.value - width) ? option : best
  ).value;
}

export const INK_TOOL_LABELS: Record<SongInkTool | 'eraser', string> = {
  pen: 'Перо',
  highlighter: 'Маркер',
  arrow: 'Стрелка',
  text: 'Заметка',
  eraser: 'Ластик',
};

/** Инструмент, выбранный в панели: рисующие + ластик. */
export type InkToolChoice = SongInkTool | 'eraser';

/**
 * CSS-цвет для образца в UI (кружок палитры, точка в плашке режима, превью толщины).
 * Отдельно от `resolveInkColor`: тому нужен вычисленный цвет для canvas, а разметке
 * достаточно `var(--app-text)` — она сама перекрасится при смене темы.
 */
export function inkSwatchColor(value: string): string {
  return INK_COLORS.find((option) => option.value === value)?.swatch ?? value;
}

/**
 * Реальный цвет для canvas/DOM. `INK_COLOR_THEME` берётся из CSS-переменной темы,
 * поэтому пометка читается и на светлом, и на тёмном листе.
 */
export function resolveInkColor(color: string, el: Element | null): string {
  if (color !== INK_COLOR_THEME) return color;
  if (!el) return '#111827';
  const value = getComputedStyle(el).getPropertyValue('--app-text').trim();
  return value || '#111827';
}
