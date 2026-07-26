/**
 * Дефолты нового сета: дата — ближайшее воскресенье, название — «Вск. Служение dd.mm.yyyy».
 *
 * Даты собираем и разбираем покомпонентно через локальный `Date`, без `new Date('YYYY-MM-DD')`:
 * тот парсит строку как UTC-полночь, и в отрицательных смещениях от UTC день недели съезжает
 * на минус один (тот же капкан задокументирован в `formatSetlistDate.ts`).
 */

const SUNDAY = 0;

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Ближайшее воскресенье в формате `YYYY-MM-DD`. Если `from` — уже воскресенье,
 * возвращает этот же день (сет чаще готовят в день служения или накануне, а не
 * на неделю вперёд), а не следующее.
 */
export function nextSundayISO(from: Date = new Date()): string {
  const daysUntilSunday = (SUNDAY - from.getDay() + 7) % 7;
  // Конструктор Date сам нормализует выход за границы месяца/года.
  const sunday = new Date(from.getFullYear(), from.getMonth(), from.getDate() + daysUntilSunday);
  return toISODate(sunday);
}

/** «Вск. Служение 02.08.2026» из даты `YYYY-MM-DD`. Пустая/битая дата — просто «Вск. Служение». */
export function defaultSetlistTitle(dateISO: string | null | undefined): string {
  if (!dateISO) return 'Вск. Служение';
  const [year, month, day] = dateISO.split('-');
  if (!year || !month || !day) return 'Вск. Служение';
  return `Вск. Служение ${day}.${month}.${year}`;
}
