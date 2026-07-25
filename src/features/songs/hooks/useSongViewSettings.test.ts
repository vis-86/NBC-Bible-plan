// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  useSongViewSettings,
  SONG_VIEW_SETTINGS_STORAGE_KEY,
  DEFAULT_SONG_VIEW_SETTINGS,
} from './useSongViewSettings';

const LEGACY_KEY = 'songs:font-size';

describe('useSongViewSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('дефолты, когда ничего не сохранено', () => {
    const { result } = renderHook(() => useSongViewSettings());
    expect(result.current[0]).toEqual(DEFAULT_SONG_VIEW_SETTINGS);
  });

  it('читает сохранённые настройки из localStorage', () => {
    localStorage.setItem(
      SONG_VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({ mode: 'sheets', columns: 2, fontSize: 20, density: 'compact', showChords: false, showHeader: false })
    );
    const { result } = renderHook(() => useSongViewSettings());
    expect(result.current[0]).toEqual({ mode: 'sheets', columns: 2, fontSize: 20, density: 'compact', showChords: false, showHeader: false });
  });

  it.each([
    ['ниже минимума', 5, 12],
    ['выше максимума', 99, 32],
  ])('fontSize %s → clamp (%i → %i)', (_label, stored, expected) => {
    localStorage.setItem(SONG_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify({ fontSize: stored }));
    const { result } = renderHook(() => useSongViewSettings());
    expect(result.current[0].fontSize).toBe(expected);
  });

  it('мигрирует из legacy-ключа songs:font-size и удаляет его', () => {
    localStorage.setItem(LEGACY_KEY, '24');
    const { result } = renderHook(() => useSongViewSettings());
    expect(result.current[0].fontSize).toBe(24);
    expect(result.current[0].mode).toBe('scroll');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SONG_VIEW_SETTINGS_STORAGE_KEY)!).fontSize).toBe(24);
  });

  // Smoke, не регресс-гард: инициализатор useState в StrictMode вызывается дважды.
  // Прежняя (нечистая) реализация этот сценарий тоже проходила — её спасал порядок
  // операций, — поэтому тест фиксирует требуемое поведение, но сам по себе разницы
  // между чистым и нечистым инициализатором не ловит.
  it('миграция переживает двойной вызов инициализатора (StrictMode)', () => {
    localStorage.setItem(LEGACY_KEY, '24');
    const { result } = renderHook(() => useSongViewSettings(), { wrapper: StrictMode });
    expect(result.current[0].fontSize).toBe(24);
    expect(JSON.parse(localStorage.getItem(SONG_VIEW_SETTINGS_STORAGE_KEY)!).fontSize).toBe(24);
  });

  it('битый JSON в новом ключе → дефолты, без падения', () => {
    localStorage.setItem(SONG_VIEW_SETTINGS_STORAGE_KEY, '{not json');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useSongViewSettings());
    expect(result.current[0]).toEqual(DEFAULT_SONG_VIEW_SETTINGS);
    warnSpy.mockRestore();
  });

  it('обновление патчем персистит и клампит', () => {
    const { result } = renderHook(() => useSongViewSettings());

    act(() => {
      result.current[1]({ mode: 'paged', fontSize: 999 });
    });

    expect(result.current[0].mode).toBe('paged');
    expect(result.current[0].fontSize).toBe(32);
    const stored = JSON.parse(localStorage.getItem(SONG_VIEW_SETTINGS_STORAGE_KEY)!);
    expect(stored.mode).toBe('paged');
    expect(stored.fontSize).toBe(32);
  });

  it('graceful fallback при недоступном localStorage', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useSongViewSettings());
    expect(result.current[0]).toEqual(DEFAULT_SONG_VIEW_SETTINGS);

    getItemSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
