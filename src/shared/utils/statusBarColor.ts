/**
 * Управление `<meta name="theme-color">` — цвет зоны статус-бара («брови»).
 *
 * Инвариант: бровь ВСЕГДА одного цвета с шапкой текущего экрана. Сама бровь
 * закрашивается фоном шапки (pt-safe при viewport-fit=cover); meta theme-color
 * дублирует этот цвет для Android/браузерного хрома.
 *
 * Модель: базовый цвет — фон страницы (--app-bg) по теме приложения; экраны,
 * чья шапка другого цвета (PageHeader → --app-surface, ридер → тема ридера),
 * пушат override на время своей жизни (см. useStatusBarColor). Побеждает
 * последний запушенный (самый глубокий смонтированный экран).
 *
 * Hex-значения дублируют токены globals.css (:root / [data-theme="dark"]) —
 * держать в синхроне при изменении палитры.
 */

export type StatusBarToken = 'bg' | 'surface';
type ThemeName = 'light' | 'dark';

export const STATUS_BAR_COLORS: Record<ThemeName, Record<StatusBarToken, string>> = {
  light: { bg: '#FAFAF9', surface: '#ffffff' },
  dark: { bg: '#1c1917', surface: '#292524' },
};

/** Токен ('bg' | 'surface', резолвится по текущей теме) или литеральный CSS-цвет. */
export type StatusBarColorValue = StatusBarToken | (string & {});

let baseTheme: ThemeName = 'light';
let nextId = 0;
const overrides: Array<{ id: number; value: StatusBarColorValue }> = [];

function resolve(value: StatusBarColorValue): string {
  if (value === 'bg' || value === 'surface') {
    return STATUS_BAR_COLORS[baseTheme][value as StatusBarToken];
  }
  return value;
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const value: StatusBarColorValue =
    overrides.length > 0 ? overrides[overrides.length - 1].value : 'bg';
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = resolve(value);
}

/** Базовая тема приложения — выставляется ThemeProvider'ом при смене темы. */
export function setStatusBarBaseTheme(theme: ThemeName): void {
  baseTheme = theme;
  apply();
}

/** Запушить цвет брови текущего экрана. Возвращает id для popStatusBarColor. */
export function pushStatusBarColor(value: StatusBarColorValue): number {
  const id = nextId++;
  overrides.push({ id, value });
  apply();
  return id;
}

/** Снять override по id (при размонтировании экрана). */
export function popStatusBarColor(id: number): void {
  const idx = overrides.findIndex((o) => o.id === id);
  if (idx !== -1) overrides.splice(idx, 1);
  apply();
}

/** Только для тестов: сброс модульного состояния. */
export function resetStatusBarColorForTests(): void {
  baseTheme = 'light';
  overrides.length = 0;
}
