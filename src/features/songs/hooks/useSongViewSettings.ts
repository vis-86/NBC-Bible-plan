'use client';

import { useCallback, useState } from 'react';

export const SONG_VIEW_SETTINGS_STORAGE_KEY = 'songs:view-settings';
/** Старый ключ (v1, только fontSize) — мигрируем из него один раз при первом чтении. */
const LEGACY_FONT_SIZE_STORAGE_KEY = 'songs:font-size';

export type SongViewMode = 'scroll' | 'sheets' | 'paged';
export type SongViewDensity = 'comfortable' | 'compact';
export type SongViewColumns = 1 | 2;

export interface SongViewSettings {
  mode: SongViewMode;
  columns: SongViewColumns;
  fontSize: number;
  density: SongViewDensity;
  showChords: boolean;
  showHeader: boolean;
}

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 32;

export const DEFAULT_SONG_VIEW_SETTINGS: SongViewSettings = {
  mode: 'scroll',
  columns: 1,
  fontSize: 17,
  density: 'comfortable',
  showChords: true,
  showHeader: true,
};

const MODES: readonly SongViewMode[] = ['scroll', 'sheets', 'paged'];
const DENSITIES: readonly SongViewDensity[] = ['comfortable', 'compact'];

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
  const mode = raw?.mode && MODES.includes(raw.mode) ? raw.mode : DEFAULT_SONG_VIEW_SETTINGS.mode;
  const density = raw?.density && DENSITIES.includes(raw.density) ? raw.density : DEFAULT_SONG_VIEW_SETTINGS.density;
  const columns = raw?.columns === 2 ? 2 : DEFAULT_SONG_VIEW_SETTINGS.columns;
  const showChords = typeof raw?.showChords === 'boolean' ? raw.showChords : DEFAULT_SONG_VIEW_SETTINGS.showChords;
  const showHeader = typeof raw?.showHeader === 'boolean' ? raw.showHeader : DEFAULT_SONG_VIEW_SETTINGS.showHeader;

  return { mode, columns, fontSize, density, showChords, showHeader };
}

/** Читает и удаляет legacy-ключ размера шрифта (одноразовая миграция v1 → v2). */
function readAndClearLegacyFontSize(): number | null {
  try {
    const raw = localStorage.getItem(LEGACY_FONT_SIZE_STORAGE_KEY);
    if (raw === null) return null;
    localStorage.removeItem(LEGACY_FONT_SIZE_STORAGE_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampFontSize(parsed) : null;
  } catch (err) {
    warnStorageUnavailable(err);
    return null;
  }
}

function readSettings(): SongViewSettings {
  try {
    const raw = localStorage.getItem(SONG_VIEW_SETTINGS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<SongViewSettings>;
      return sanitize(parsed);
    }

    const legacyFontSize = readAndClearLegacyFontSize();
    if (legacyFontSize === null) return { ...DEFAULT_SONG_VIEW_SETTINGS };

    const migrated = { ...DEFAULT_SONG_VIEW_SETTINGS, fontSize: legacyFontSize };
    writeSettings(migrated);
    return migrated;
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

/**
 * Персист настроек просмотра песни (режим/колонки/шрифт/плотность/аккорды/шапка)
 * одним JSON-ключом в localStorage (device-scoped, без серверной синхронизации).
 */
export function useSongViewSettings(): [SongViewSettings, (patch: Partial<SongViewSettings>) => void] {
  const [settings, setSettingsState] = useState<SongViewSettings>(() => readSettings());

  const setSettings = useCallback((patch: Partial<SongViewSettings>) => {
    setSettingsState((prev) => {
      const next = sanitize({ ...prev, ...patch });
      writeSettings(next);
      return next;
    });
  }, []);

  return [settings, setSettings];
}
