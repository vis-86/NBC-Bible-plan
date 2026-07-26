import { describe, expect, it } from 'vitest';
import { partitionSetlists } from './archive';
import type { SetlistSummary } from '../types';

function summary(id: string, date: string | null): SetlistSummary {
  return { id, title: id, date, items: [] };
}

describe('partitionSetlists', () => {
  const today = '2026-08-01';

  it('прошлое уходит в past', () => {
    const { past, upcoming, undated } = partitionSetlists([summary('a', '2026-07-31')], today);
    expect(past.map((s) => s.id)).toEqual(['a']);
    expect(upcoming).toEqual([]);
    expect(undated).toEqual([]);
  });

  it('сегодня считается upcoming, не past', () => {
    const { upcoming, past } = partitionSetlists([summary('a', today)], today);
    expect(upcoming.map((s) => s.id)).toEqual(['a']);
    expect(past).toEqual([]);
  });

  it('будущее уходит в upcoming', () => {
    const { upcoming } = partitionSetlists([summary('a', '2026-08-02')], today);
    expect(upcoming.map((s) => s.id)).toEqual(['a']);
  });

  it('без даты уходит в undated', () => {
    const { undated } = partitionSetlists([summary('a', null)], today);
    expect(undated.map((s) => s.id)).toEqual(['a']);
  });

  it('пустой список -> все три группы пусты', () => {
    const result = partitionSetlists([], today);
    expect(result).toEqual({ upcoming: [], undated: [], past: [] });
  });

  it('смешанный список распределяется по трём группам, сохраняя исходный порядок', () => {
    const list = [
      summary('future-1', '2026-08-05'),
      summary('today', today),
      summary('undated-1', null),
      summary('past-1', '2026-07-20'),
      summary('undated-2', null),
      summary('past-2', '2026-07-25'),
    ];
    const result = partitionSetlists(list, today);
    expect(result.upcoming.map((s) => s.id)).toEqual(['future-1', 'today']);
    expect(result.undated.map((s) => s.id)).toEqual(['undated-1', 'undated-2']);
    expect(result.past.map((s) => s.id)).toEqual(['past-1', 'past-2']);
  });
});
