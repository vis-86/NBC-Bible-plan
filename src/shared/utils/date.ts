const MS_PER_DAY = 86400000;

/** День недели: понедельник = 0, воскресенье = 6. */
function getDayOfWeekMonFirst(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Номер календарной недели года (1–53).
 * Неделя с понедельника по воскресенье.
 * Первая неделя может быть неполной, если 1 января не понедельник (например, среда → неделя 1 = ср–вс).
 */
export function getWeekNumber(date: Date): number {
  const year = date.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const monOfWeek1 = new Date(jan1);
  monOfWeek1.setDate(jan1.getDate() - getDayOfWeekMonFirst(jan1));

  const mondayOfDate = new Date(date);
  mondayOfDate.setDate(date.getDate() - getDayOfWeekMonFirst(date));

  const diffDays = (mondayOfDate.getTime() - monOfWeek1.getTime()) / MS_PER_DAY;
  return 1 + Math.floor(diffDays / 7);
}

/**
 * Понедельник первой недели года (неделя, содержащая 1 января).
 */
function getMondayOfWeek1(year: number): Date {
  const jan1 = new Date(year, 0, 1);
  const mon = new Date(jan1);
  mon.setDate(jan1.getDate() - getDayOfWeekMonFirst(jan1));
  return mon;
}

/**
 * Возвращает понедельник и воскресенье для номера недели (1–52) в заданном году.
 * Неделя: Пн–Вс (включительно), как в getWeekNumber.
 */
export function getWeekDateRange(weekNumber: number, year: number): { start: Date; end: Date } {
  const monOfWeek1 = getMondayOfWeek1(year);
  const monday = new Date(monOfWeek1);
  monday.setDate(monOfWeek1.getDate() + (weekNumber - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

/** Форматирует дату в DD.MM */
export function formatDateDDMM(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}`;
}
