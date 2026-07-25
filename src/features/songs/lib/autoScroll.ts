/**
 * Чистое ядро автоскролла (§8): ступени скорости и перевод «строк/мин» в «px/сек».
 *
 * Скорость измеряется в строках лирики в минуту — так её задаёт музыкант (§8), а не в
 * пикселях: пиксель зависит от размера шрифта и плотности, а «строка» — величина,
 * понятная человеку и стабильная при смене шрифта. Перевод в пиксели — задача рендера:
 * реальную высоту строки в px измеряет хук (`getComputedStyle(...).lineHeight`), а не эта
 * либа. Функция принимает уже посчитанный `lineHeightPx`, оставаясь чистой и тестируемой.
 *
 * Логирования здесь нет намеренно: чистая математика без побочных эффектов.
 */

/**
 * Ступени скорости в строках лирики в минуту (§8). Линейная прогрессия из трёх параметров —
 * так набор легко тюнить (число ступеней, старт, шаг), не трогая остальной код. ~20 ступеней
 * дают мелкую регулировку кнопками ±1 (5 было грубовато). Монотонно возрастает.
 */
export const AUTOSCROLL_STEP_COUNT = 30;
const MIN_ROWS_PER_MIN = 2;
const ROWS_PER_MIN_INCREMENT = 2;
export const AUTOSCROLL_STEPS: readonly number[] = Array.from(
  { length: AUTOSCROLL_STEP_COUNT },
  (_, i) => MIN_ROWS_PER_MIN + i * ROWS_PER_MIN_INCREMENT,
);

/**
 * Индекс ступени по умолчанию для песни без записи и без глобальной «последней».
 * Соответствует ~8 строк/мин — спокойный темп чтения.
 */
export const DEFAULT_STEP_INDEX = 3;

/** Максимальный валидный индекс ступени. */
const MAX_STEP_INDEX = AUTOSCROLL_STEPS.length - 1;

/**
 * Скорость проматывания в px/сек для заданной ступени (строк/мин) и реальной высоты
 * строки в px. `lineHeightPx` = множитель `--line-height` × fontSize — резолвится хуком
 * через `getComputedStyle`, сюда приходит уже в пикселях.
 */
export function pixelsPerSecond(rowsPerMin: number, lineHeightPx: number): number {
  return (rowsPerMin / 60) * lineHeightPx;
}

/** Зажимает индекс ступени в валидный диапазон [0..MAX]; нецелое/NaN → дефолт. */
export function clampStepIndex(index: number): number {
  if (!Number.isFinite(index)) return DEFAULT_STEP_INDEX;
  const rounded = Math.round(index);
  if (rounded < 0) return 0;
  if (rounded > MAX_STEP_INDEX) return MAX_STEP_INDEX;
  return rounded;
}
