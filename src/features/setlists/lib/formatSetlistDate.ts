const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTH_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/**
 * Форматирует дату сета вида `YYYY-MM-DD` в «вс, 3 августа». Пустая/битая дата — `null`:
 * UI не показывает строку вовсе, а не пишет «без даты» (лишний шум на карточке).
 * Разбор строки вручную (без `Date`-парсинга ISO), т.к. `new Date('YYYY-MM-DD')` трактует
 * дату как UTC-полночь — в отрицательных смещениях от UTC день недели съезжает на минус один.
 */
export function formatSetlistDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  const weekday = WEEKDAY_SHORT[date.getDay()];
  const monthName = MONTH_GENITIVE[month - 1];
  return `${weekday}, ${day} ${monthName}`;
}

/**
 * Отметка времени сохранённого черновика в «27 июля, 14:30» — для плашки восстановления.
 * Здесь `Date` из epoch-мс (не разбор ISO-строки), так что UTC-капкана из `formatSetlistDate`
 * нет: значение уже абсолютное, локальная зона применяется штатно.
 */
export function formatDraftSavedAt(timestamp: number): string {
  const date = new Date(timestamp);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()} ${MONTH_GENITIVE[date.getMonth()]}, ${time}`;
}
