import { describe, expect, it } from 'vitest';
import { groupSongLinePairs } from './songLinePairs';

describe('groupSongLinePairs', () => {
  it('склеивает строки парами: 1+2, 3+4', () => {
    expect(groupSongLinePairs(['a', 'b', 'c', 'd'])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('нечётная последняя строка остаётся одна', () => {
    expect(groupSongLinePairs(['a', 'b', 'c'])).toEqual([[0, 1], [2]]);
  });

  it('пустая строка идёт отдельно и обнуляет счёт пар', () => {
    // Без сброса пара собралась бы как (b, c) — отбивка съедена, все следующие
    // строки склеены не с теми соседями.
    expect(groupSongLinePairs(['a', 'b', '', 'c', 'd'])).toEqual([[0, 1], [2], [3, 4]]);
  });

  it('строка из одних пробелов считается пустой', () => {
    expect(groupSongLinePairs(['a', '   ', 'b'])).toEqual([[0], [1], [2]]);
  });

  it('пустая секция даёт пустой список групп', () => {
    expect(groupSongLinePairs([])).toEqual([]);
  });
});
