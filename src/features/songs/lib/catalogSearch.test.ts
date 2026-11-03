import { describe, expect, it } from 'vitest';
import { filterCatalog } from './catalogSearch';

const songs = [
  { id: '1', title: 'Всё в Тебе', subtitle: 'Хвала', teamName: 'А' },
  { id: '2', title: 'Велик Господь', teamName: 'Б' },
];

describe('filterCatalog', () => {
  it('пустой запрос — весь список', () => {
    expect(filterCatalog(songs, '  ')).toHaveLength(2);
  });
  it('ищет по названию без учёта ё/е и регистра', () => {
    expect(filterCatalog(songs, 'все в')).toEqual([songs[0]]);
  });
  it('ищет по подзаголовку', () => {
    expect(filterCatalog(songs, 'хвала')).toEqual([songs[0]]);
  });
});
