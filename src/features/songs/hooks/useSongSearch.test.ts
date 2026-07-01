import { describe, it, expect } from 'vitest';
import { searchSongs } from './useSongSearch';
import type { SongSummary } from '../types';

const SONGS: SongSummary[] = [
  { id: '1', title: 'Аллилуйя Наш Спаситель', subtitle: 'Hallelujah, what a Savior' },
  { id: '2', title: 'Свят Господь', subtitle: 'Holy is the Lord' },
  { id: '3', title: 'Великий Бог', subtitle: 'How Great Thou Art' },
];

describe('searchSongs', () => {
  it('returns the full list for an empty query', () => {
    expect(searchSongs(SONGS, '')).toEqual(SONGS);
    expect(searchSongs(SONGS, '   ')).toEqual(SONGS);
  });

  it('matches by title', () => {
    const res = searchSongs(SONGS, 'Свят');
    expect(res.map((s) => s.id)).toContain('2');
  });

  it('matches by subtitle', () => {
    const res = searchSongs(SONGS, 'Great');
    expect(res.map((s) => s.id)).toContain('3');
  });

  it('tolerates a typo (fuzzy)', () => {
    const res = searchSongs(SONGS, 'Аллилуя'); // без второй "й"
    expect(res.map((s) => s.id)).toContain('1');
  });

  it('returns empty for a non-matching query', () => {
    expect(searchSongs(SONGS, 'zzzxxxqqq')).toEqual([]);
  });
});
