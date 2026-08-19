/**
 * Палитра цвета аккордов на листе песни.
 *
 * ИСКЛЮЧЕНИЕ из правила «только семантические токены» — ровно как `INK_COLORS` и
 * `theme-light|dark|sepia` в ридере: это пользовательский выбор оформления листа,
 * а не цвет интерфейса. Два значения по умолчанию остаются токенами (`--app-primary`,
 * `--app-text`), поэтому тёмная тема для них работает сама.
 */

/** Сентинел «цвет по теме» — резолвится в `--app-primary` (историческое поведение). */
export const CHORD_COLOR_THEME = 'theme';
/** Сентинел «как основной текст» — резолвится в `--app-text`. */
export const CHORD_COLOR_TEXT = 'text';

export const CHORD_COLORS: ReadonlyArray<{ value: string; label: string; swatch: string }> = [
  { value: CHORD_COLOR_THEME, label: 'По теме', swatch: 'var(--app-primary)' },
  { value: CHORD_COLOR_TEXT, label: 'Как текст', swatch: 'var(--app-text)' },
  { value: '#ea580c', label: 'Оранжевый', swatch: '#ea580c' },
  { value: '#ca8a04', label: 'Жёлтый', swatch: '#ca8a04' },
  { value: '#16a34a', label: 'Зелёный', swatch: '#16a34a' },
  { value: '#0284c7', label: 'Синий', swatch: '#0284c7' },
  { value: '#7c3aed', label: 'Фиолетовый', swatch: '#7c3aed' },
  { value: '#db2777', label: 'Розовый', swatch: '#db2777' },
];

export function isChordColor(value: unknown): value is string {
  return typeof value === 'string' && CHORD_COLORS.some((option) => option.value === value);
}

/** CSS-цвет для переменной `--chord-color` (и для образца в UI — он тот же). */
export function resolveChordColor(value: string): string {
  if (value === CHORD_COLOR_THEME) return 'var(--app-primary)';
  if (value === CHORD_COLOR_TEXT) return 'var(--app-text)';
  return value;
}
