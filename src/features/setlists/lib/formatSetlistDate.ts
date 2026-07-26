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
 * Форматирует дату сета вида `YYYY-MM-DD` в «вс, 3 августа». `null`/`undefined` — «без даты».
 * Разбор строки вручную (без `Date`-парсинга ISO), т.к. `new Date('YYYY-MM-DD')` трактует
 * дату как UTC-полночь — в отрицательных смещениях от UTC день недели съезжает на минус один.
 */
export function formatSetlistDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'без даты';
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return 'без даты';

  const date = new Date(year, month - 1, day);
  const weekday = WEEKDAY_SHORT[date.getDay()];
  const monthName = MONTH_GENITIVE[month - 1];
  return `${weekday}, ${day} ${monthName}`;
}
