import type { SetlistSummary } from '../types';

export interface PartitionedSetlists {
  upcoming: SetlistSummary[];
  undated: SetlistSummary[];
  past: SetlistSummary[];
}

/**
 * Делит список сетов на «Ближайшие»/«Без даты»/«Архив». Границей служит
 * `date === todayISO` — сет на сегодня считается upcoming, а не прошедшим.
 * Сравнение строк `YYYY-MM-DD` лексикографически, без `Date`/таймзон.
 * Ближайшие и без даты сохраняют порядок BFF (`date ASC NULLS LAST, date_created DESC`),
 * архив — разворачивается: свежие сверху, ищут в нём почти всегда недавний сет.
 */
export function partitionSetlists(list: SetlistSummary[], todayISO: string): PartitionedSetlists {
  const upcoming: SetlistSummary[] = [];
  const undated: SetlistSummary[] = [];
  const past: SetlistSummary[] = [];

  for (const setlist of list) {
    if (setlist.date === null) {
      undated.push(setlist);
    } else if (setlist.date >= todayISO) {
      upcoming.push(setlist);
    } else {
      past.push(setlist);
    }
  }

  // Стабильная сортировка: сеты одного дня остаются в порядке BFF.
  past.sort((a, b) => (a.date === b.date ? 0 : (a.date as string) < (b.date as string) ? 1 : -1));

  return { upcoming, undated, past };
}
