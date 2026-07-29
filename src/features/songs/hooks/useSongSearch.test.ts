import { describe, it, expect } from 'vitest';
import { searchSongs } from './useSongSearch';
import type { SongSummary } from '../types';

const SONGS: SongSummary[] = [
  { id: '1', title: 'Аллилуйя Наш Спаситель', subtitle: 'Hallelujah, what a Savior', plainText: 'Аллилуйя, какой Спаситель' },
  { id: '2', title: 'Свят Господь', subtitle: 'Holy is the Lord', plainText: 'Свят, свят, свят Господь' },
  { id: '3', title: 'Великий Бог', subtitle: 'How Great Thou Art', plainText: 'Тихая ночь опустилась на землю' },
  // Название без слова «благодать», но оно есть в тексте, разорванное аккордом.
  { id: '4', title: 'Дивная любовь', subtitle: 'Amazing Grace', plainText: 'благодать сколь сладок звук' },
  // Точное совпадение с пунктуацией в названии.
  { id: '5', title: 'О, благодать!', subtitle: 'Amazing Grace', plainText: 'О, благодать! Спасён тобой' },
];

const ids = (hits: ReturnType<typeof searchSongs>) => hits.map((h) => h.song.id);

describe('searchSongs', () => {
  it('пустой запрос возвращает весь список в исходном порядке', () => {
    const hits = searchSongs(SONGS, '');
    expect(ids(hits)).toEqual(['1', '2', '3', '4', '5']);
    expect(hits.every((h) => h.match === 'title')).toBe(true);
  });

  it('находит «О, благодать» по запросу «о благодать» и ставит её первой (match: title)', () => {
    const hits = searchSongs(SONGS, 'о благодать');
    expect(hits[0].song.id).toBe('5');
    expect(hits[0].match).toBe('title');
  });

  it('регистр и пунктуация запроса не влияют', () => {
    expect(ids(searchSongs(SONGS, '«О, БЛАГОДАТЬ!»'))[0]).toBe('5');
  });

  it('название всегда выше совпадения по тексту', () => {
    // Слово «благодать» есть в названии песни 5 и в тексте песни 4.
    const hits = searchSongs(SONGS, 'благодать');
    const idx5 = ids(hits).indexOf('5');
    const idx4 = ids(hits).indexOf('4');
    expect(idx5).toBeGreaterThanOrEqual(0);
    expect(idx4).toBeGreaterThan(idx5);
    expect(hits[idx4].match).toBe('text');
  });

  it('находит по тексту слово, разорванное аккордом, со сниппетом', () => {
    // plainText песни 4 уже очищен от аккордов (это делает BFF) — здесь проверяем матч по тексту.
    const hit = searchSongs(SONGS, 'сладок').find((h) => h.song.id === '4');
    expect(hit).toBeDefined();
    expect(hit!.match).toBe('text');
    expect(hit!.snippet).toBeTruthy();
    expect(hit!.snippet).toContain('сладок');
  });

  it('многословный запрос по тексту работает как AND', () => {
    // «тихая ночь» есть только у песни 3; «свят ночь» не должно найти ничего по тексту.
    expect(ids(searchSongs(SONGS, 'тихая ночь'))).toContain('3');
    const svyatNoch = searchSongs(SONGS, 'свят ночь').filter((h) => h.match === 'text');
    expect(svyatNoch).toHaveLength(0);
  });

  it('песня без plainText находится по названию, но не по тексту', () => {
    const noText: SongSummary[] = [{ id: '9', title: 'Старый кэш', subtitle: undefined }];
    expect(ids(searchSongs(noText, 'старый'))).toEqual(['9']);
    expect(searchSongs(noText, 'кэша нет в тексте вообще')).toHaveLength(0);
  });

  it('нет дублей: песня, попавшая и в название, и в текст, встречается один раз', () => {
    // «благодать» у песни 5 и в названии, и в тексте — должна быть ровно одна.
    const hits = searchSongs(SONGS, 'благодать');
    expect(ids(hits).filter((id) => id === '5')).toHaveLength(1);
  });

  it('терпит опечатку в названии (fuzzy)', () => {
    expect(ids(searchSongs(SONGS, 'Аллилуя'))).toContain('1'); // без второй «й»
  });

  it('возвращает пустой список для несуществующего запроса', () => {
    expect(searchSongs(SONGS, 'zzzxxxqqq')).toHaveLength(0);
  });
});
