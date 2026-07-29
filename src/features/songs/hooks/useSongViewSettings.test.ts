// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  useSongViewSettings,
  resolveSongViewMode,
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
      JSON.stringify({ columns: 2, fontSize: 20, density: 'compact', showChords: false, showHeader: false })
    );
    const { result } = renderHook(() => useSongViewSettings());
    // Полей режима пометок в старом JSON нет — они добираются дефолтами (M10).
    expect(result.current[0]).toEqual({
      columns: 2,
      fontSize: 20,
      density: 'compact',
      showChords: false,
      showHeader: false,
      inkPenOnly: false,
      inkInstant: false,
      inkColor: DEFAULT_SONG_VIEW_SETTINGS.inkColor,
    });
  });

  it('помнит выбранный цвет пометок, а чужое значение отбрасывает', () => {
    localStorage.setItem(SONG_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify({ inkColor: '#16a34a' }));
    expect(renderHook(() => useSongViewSettings()).result.current[0].inkColor).toBe('#16a34a');

    // Цвет вне палитры уехал бы в canvas как есть — штрих мог оказаться невидимым.
    localStorage.setItem(SONG_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify({ inkColor: 'transparent' }));
    expect(renderHook(() => useSongViewSettings()).result.current[0].inkColor).toBe(
      DEFAULT_SONG_VIEW_SETTINGS.inkColor
    );
  });

  it('читает сохранённые тумблеры режима пометок', () => {
    localStorage.setItem(SONG_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify({ inkPenOnly: true, inkInstant: true }));
    const { result } = renderHook(() => useSongViewSettings());
    expect(result.current[0]).toMatchObject({ inkPenOnly: true, inkInstant: true });
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
      result.current[1]({ columns: 2, fontSize: 999 });
    });

    expect(result.current[0].columns).toBe(2);
    expect(result.current[0].fontSize).toBe(32);
    const stored = JSON.parse(localStorage.getItem(SONG_VIEW_SETTINGS_STORAGE_KEY)!);
    expect(stored.columns).toBe(2);
    expect(stored.fontSize).toBe(32);
  });

  it('сохранённый со старой версии {"mode":"paged"} игнорируется, парсинг не падает', () => {
    localStorage.setItem(SONG_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify({ mode: 'paged', fontSize: 18 }));
    const { result } = renderHook(() => useSongViewSettings());
    expect(result.current[0]).not.toHaveProperty('mode');
    expect(result.current[0].fontSize).toBe(18);
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

describe('resolveSongViewMode', () => {
  it.each([
    [1, false, 'scroll'],
    [1, true, 'scroll'],
    [2, false, 'scroll'],
    [2, true, 'sheets'],
  ] as const)('columns=%s, isWideLayout=%s → %s', (columns, isWideLayout, expected) => {
    expect(resolveSongViewMode(columns, isWideLayout)).toBe(expected);
  });
});
