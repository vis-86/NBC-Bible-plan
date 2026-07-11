// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSongFontSize, SONG_FONT_SIZE_STORAGE_KEY } from './useSongFontSize';

describe('useSongFontSize', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('дефолт 17px, когда ничего не сохранено', () => {
    const { result } = renderHook(() => useSongFontSize());
    expect(result.current[0]).toBe(17);
  });

  it('читает сохранённое значение из localStorage', () => {
    localStorage.setItem(SONG_FONT_SIZE_STORAGE_KEY, '22');
    const { result } = renderHook(() => useSongFontSize());
    expect(result.current[0]).toBe(22);
  });

  it.each([
    ['ниже минимума', '5', 14],
    ['выше максимума', '99', 28],
    ['невалидное значение', 'not-a-number', 17],
  ])('%s → clamp/дефолт (%s → %i)', (_label, stored, expected) => {
    localStorage.setItem(SONG_FONT_SIZE_STORAGE_KEY, stored);
    const { result } = renderHook(() => useSongFontSize());
    expect(result.current[0]).toBe(expected);
  });

  it('запись под той же константой ключа + clamp применяется при setFontSize', () => {
    const { result } = renderHook(() => useSongFontSize());

    act(() => {
      result.current[1](24);
    });
    expect(result.current[0]).toBe(24);
    expect(localStorage.getItem(SONG_FONT_SIZE_STORAGE_KEY)).toBe('24');

    act(() => {
      result.current[1](999);
    });
    expect(result.current[0]).toBe(28);
    expect(localStorage.getItem(SONG_FONT_SIZE_STORAGE_KEY)).toBe('28');
  });

  it('graceful fallback при недоступном localStorage', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useSongFontSize());
    expect(result.current[0]).toBe(17);

    getItemSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
