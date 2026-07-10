/**
 * Последнее место чтения в localStorage: писатель — страница ридера
 * (`/dashboard/read`), читатель — таб «Библия» в нижней навигации. Один общий
 * ключ на оба конца (разъехавшиеся ключи уже роняли офлайн-кеш песен,
 * см. patches/2026-07-10-16.46), поэтому доступ только через эти функции.
 */

const STORAGE_KEY = 'reading:last-location';

/** Дефолт при отсутствии сохранённого места — Бытие 1 (как было в статичной ссылке таба). */
export const DEFAULT_READ_LOCATION: LastReadLocation = { book: 'Бытие', chapter: 1 };

export interface LastReadLocation {
  book: string;
  chapter: number;
}

export function saveLastReadLocation(loc: LastReadLocation): void {
  if (typeof window === 'undefined') return;
  if (!loc.book || !Number.isFinite(loc.chapter)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch (err) {
    // localStorage может быть недоступен (приватный режим, переполнение) —
    // сохранение места чтения не критично, тихо пропускаем.
    console.warn('[reading] не удалось сохранить последнее место чтения', err);
  }
}

export function getLastReadLocation(): LastReadLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as LastReadLocation).book === 'string' &&
      (parsed as LastReadLocation).book.length > 0 &&
      Number.isFinite((parsed as LastReadLocation).chapter)
    ) {
      return { book: (parsed as LastReadLocation).book, chapter: (parsed as LastReadLocation).chapter };
    }
    return null;
  } catch (err) {
    console.warn('[reading] не удалось прочитать последнее место чтения', err);
    return null;
  }
}

/** URL таба «Библия»: последнее сохранённое место или дефолт (Бытие 1). */
export function bibleTabHref(): string {
  const loc = getLastReadLocation() ?? DEFAULT_READ_LOCATION;
  const query = new URLSearchParams({ book: loc.book, chapter: String(loc.chapter) });
  return `/dashboard/read?${query.toString()}`;
}
