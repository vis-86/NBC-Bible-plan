// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_READ_LOCATION,
  bibleTabHref,
  getLastReadLocation,
  saveLastReadLocation,
} from './last-read-location';

afterEach(() => {
  window.localStorage.clear();
});

describe('last-read-location', () => {
  it('сохраняет и читает последнее место', () => {
    saveLastReadLocation({ book: 'Псалтирь', chapter: 23 });
    expect(getLastReadLocation()).toEqual({ book: 'Псалтирь', chapter: 23 });
  });

  it('без сохранённого места возвращает null', () => {
    expect(getLastReadLocation()).toBeNull();
  });

  it('игнорирует невалидную запись (не число / пустая книга)', () => {
    saveLastReadLocation({ book: '', chapter: NaN });
    expect(getLastReadLocation()).toBeNull();
  });

  it('не падает на битом JSON в localStorage', () => {
    window.localStorage.setItem('reading:last-location', '{не json');
    expect(getLastReadLocation()).toBeNull();
  });

  it('bibleTabHref использует сохранённое место', () => {
    saveLastReadLocation({ book: 'Иоанна', chapter: 3 });
    const href = bibleTabHref();
    expect(href.startsWith('/dashboard/read?')).toBe(true);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('book')).toBe('Иоанна');
    expect(params.get('chapter')).toBe('3');
  });

  it('bibleTabHref без сохранённого места ведёт на дефолт (Бытие 1)', () => {
    const params = new URLSearchParams(bibleTabHref().split('?')[1]);
    expect(params.get('book')).toBe(DEFAULT_READ_LOCATION.book);
    expect(params.get('chapter')).toBe(String(DEFAULT_READ_LOCATION.chapter));
  });
});
