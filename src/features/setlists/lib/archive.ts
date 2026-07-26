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
 * Относительный порядок внутри групп сохраняется (список уже приходит
 * отсортированным с BFF: `date ASC NULLS LAST, date_created DESC`).
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

  return { upcoming, undated, past };
}
