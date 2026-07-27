'use client';

import { useCallback, useEffect, useState } from 'react';

export const SONG_VIEW_SETTINGS_STORAGE_KEY = 'songs:view-settings';

/**
 * Ниже этой ширины раскладочные настройки (`columns`, производный `mode`) не имеют
 * смысла: вторая колонка читаемой ширины не помещается, а листы на телефоне проигрывают
 * обычному скроллу. Панель настроек прячет эти контролы, а `resolveSongViewMode` обязан
 * получать ту же константу — иначе сохранённые с планшета `columns: 2` включат листы
 * на телефоне без возможности их выключить.
 */
export const SONG_WIDE_LAYOUT_QUERY = '(min-width: 640px)';
/** Старый ключ (v1, только fontSize) — мигрируем из него один раз при первом чтении. */
const LEGACY_FONT_SIZE_STORAGE_KEY = 'songs:font-size';

export type SongViewMode = 'scroll' | 'sheets';
export type SongViewDensity = 'comfortable' | 'compact';
export type SongViewColumns = 1 | 2;

export interface SongViewSettings {
  columns: SongViewColumns;
  fontSize: number;
  density: SongViewDensity;
  showChords: boolean;
  showHeader: boolean;
}

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 32;

export const DEFAULT_SONG_VIEW_SETTINGS: SongViewSettings = {
  columns: 1,
  fontSize: 17,
  density: 'comfortable',
  showChords: true,
  showHeader: true,
};

const DENSITIES: readonly SongViewDensity[] = ['comfortable', 'compact'];

/**
 * `mode` больше не персистится — второй источник истины расходился с `columns`
 * (тот же класс бага, что дублирующийся ключ кэша). Единственное место, где режим
 * выводится: и `page.tsx`, и тесты обязаны звать эту функцию, а не читать `mode` сами.
 */
export function resolveSongViewMode(columns: SongViewColumns, isWideLayout: boolean): SongViewMode {
  return columns === 2 && isWideLayout ? 'sheets' : 'scroll';
}

let warnedStorageUnavailable = false;

function warnStorageUnavailable(err: unknown): void {
  if (warnedStorageUnavailable) return;
  warnedStorageUnavailable = true;
  console.warn('[useSongViewSettings] localStorage unavailable', err);
}

function clampFontSize(value: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
}

function sanitize(raw: Partial<SongViewSettings> | null | undefined): SongViewSettings {
  const fontSize = typeof raw?.fontSize === 'number' && Number.isFinite(raw.fontSize) ? clampFontSize(raw.fontSize) : DEFAULT_SONG_VIEW_SETTINGS.fontSize;
  const density = raw?.density && DENSITIES.includes(raw.density) ? raw.density : DEFAULT_SONG_VIEW_SETTINGS.density;
  const columns = raw?.columns === 2 ? 2 : DEFAULT_SONG_VIEW_SETTINGS.columns;
  const showChords = typeof raw?.showChords === 'boolean' ? raw.showChords : DEFAULT_SONG_VIEW_SETTINGS.showChords;
  const showHeader = typeof raw?.showHeader === 'boolean' ? raw.showHeader : DEFAULT_SONG_VIEW_SETTINGS.showHeader;

  // Старый JSON мог нести `mode` (до этого рефакторинга) — поле просто игнорируется:
  // `Partial<SongViewSettings>` больше не объявляет его, а sanitize строит объект заново.
  return { columns, fontSize, density, showChords, showHeader };
}

/** Читает legacy-ключ размера шрифта (миграция v1 → v2). Только чтение — см. `readSettings`. */
function readLegacyFontSize(): number | null {
  const raw = localStorage.getItem(LEGACY_FONT_SIZE_STORAGE_KEY);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampFontSize(parsed) : null;
}

/**
 * Чистая (только чтение): вызывается из инициализатора `useState`, а он обязан быть
 * чистым — React выполняет его повторно (StrictMode, отброшенный concurrent-рендер).
 * Ранняя версия удаляла legacy-ключ прямо здесь и держалась лишь на том, что запись
 * нового ключа успевала произойти до второго прогона. Все записи вынесены в эффекты.
 */
function readSettings(): SongViewSettings {
  try {
    const raw = localStorage.getItem(SONG_VIEW_SETTINGS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<SongViewSettings>;
      return sanitize(parsed);
    }

    const legacyFontSize = readLegacyFontSize();
    return legacyFontSize === null
      ? { ...DEFAULT_SONG_VIEW_SETTINGS }
      : { ...DEFAULT_SONG_VIEW_SETTINGS, fontSize: legacyFontSize };
  } catch (err) {
    warnStorageUnavailable(err);
    return { ...DEFAULT_SONG_VIEW_SETTINGS };
  }
}

function writeSettings(settings: SongViewSettings): void {
  try {
    localStorage.setItem(SONG_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    warnStorageUnavailable(err);
  }
}

function clearLegacyFontSize(): void {
  try {
    localStorage.removeItem(LEGACY_FONT_SIZE_STORAGE_KEY);
  } catch (err) {
    warnStorageUnavailable(err);
  }
}

/**
 * Персист настроек просмотра песни (режим/колонки/шрифт/плотность/аккорды/шапка)
 * одним JSON-ключом в localStorage (device-scoped, без серверной синхронизации).
 */
export function useSongViewSettings(): [SongViewSettings, (patch: Partial<SongViewSettings>) => void] {
  const [settings, setSettingsState] = useState<SongViewSettings>(() => readSettings());

  // Персист — эффектом, а не внутри updater'а: React вправе вызвать updater повторно
  // (StrictMode, прерванный concurrent-рендер), и запись из отброшенного прогона
  // разошлась бы с закоммиченным стейтом.
  useEffect(() => {
    writeSettings(settings);
  }, [settings]);

  // Новый ключ уже записан эффектом выше (эффекты выполняются в порядке объявления),
  // поэтому legacy можно убрать — читать его больше некому.
  useEffect(() => {
    clearLegacyFontSize();
  }, []);

  const setSettings = useCallback((patch: Partial<SongViewSettings>) => {
    setSettingsState((prev) => sanitize({ ...prev, ...patch }));
  }, []);

  return [settings, setSettings];
}
