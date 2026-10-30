'use client';

import { useCallback, useEffect, useState } from 'react';
import { INK_COLORS } from '../lib/inkTools';
import { CHORD_COLOR_THEME, isChordColor } from '../lib/chordColors';
import { SONG_CHORD_DISPLAYS, type SongChordDisplay } from '../lib/chordDisplay';

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
  /**
   * Свёртка аккордов при отображении: полные / без баса / только бас (`chordDisplay.ts`).
   * Одно поле на три состояния, а не два тумблера: «без баса» и «только бас» —
   * взаимоисключающие, парой тумблеров выражается невалидная комбинация.
   */
  chordDisplay: SongChordDisplay;
  /**
   * Цвет аккордов на листе (сентинел из `CHORD_COLORS` либо hex). Device-scoped, как и
   * остальные настройки просмотра: выбор зависит от экрана, на котором читают.
   */
  chordColor: string;
  /**
   * Кегль аккордов в процентах от размера лирики. Относительная величина, а не px:
   * при смене размера текста аккорды обязаны ехать вместе с ним, иначе подобранная
   * пара «текст/аккорд» разваливается на каждом шаге слайдера шрифта.
   */
  chordScale: number;
  /**
   * «Только стилус» (M10, §7): рисует лишь `pointerType === 'pen'`, палец прокручивает
   * и зумит даже внутри режима пометок. Системного palm rejection в браузере нет —
   * это единственный доступный способ отсечь ладонь.
   */
  inkPenOnly: boolean;
  /**
   * Instant annotation (M10, §7): касание пером вне режима включает режим, пауза
   * сохраняет и выходит. Убирает два тапа на каждую пометку — на репетиции их десятки.
   */
  inkInstant: boolean;
  /**
   * Последний выбранный цвет пометок (M10, §7). Живёт здесь, а не в `useSongInk`:
   * состояние сессии рисования умирает вместе с песней, а цвет человек выбирает один
   * раз и ожидает увидеть его на следующей песне и после перезапуска приложения.
   */
  inkColor: string;
  /**
   * Автозапуск автоскролла в сете: открытая песня сета сама поедет через
   * `setlistAutoScrollDelay` секунд. Только в сете — там телефон стоит на пюпитре и руки
   * заняты инструментом; на одиночной песне человек читает, а не играет.
   */
  setlistAutoScroll: boolean;
  /** Задержка автозапуска, секунды (`MIN/MAX_SETLIST_AUTOSCROLL_DELAY`). */
  setlistAutoScrollDelay: number;
}

export const MIN_SETLIST_AUTOSCROLL_DELAY = 3;
export const MAX_SETLIST_AUTOSCROLL_DELAY = 30;

export const MIN_CHORD_SCALE = 60;
export const MAX_CHORD_SCALE = 130;

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 32;

export const DEFAULT_SONG_VIEW_SETTINGS: SongViewSettings = {
  columns: 1,
  fontSize: 17,
  density: 'comfortable',
  showChords: true,
  showHeader: true,
  chordDisplay: 'full',
  chordColor: CHORD_COLOR_THEME,
  // 85% — исторический кегль аккордов (`font-size: 0.85em` в songs.css до этой настройки).
  chordScale: 85,
  inkPenOnly: false,
  inkInstant: false,
  // Красный: пометка обязана отличаться от печатного текста листа с одного взгляда,
  // а «цвет по теме» сливается с ним ровно в тот момент, когда пометку ищут глазами.
  inkColor: '#dc2626',
  setlistAutoScroll: false,
  setlistAutoScrollDelay: 10,
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

export function clampChordScale(value: number): number {
  return Math.min(MAX_CHORD_SCALE, Math.max(MIN_CHORD_SCALE, Math.round(value)));
}

export function clampSetlistAutoScrollDelay(value: number): number {
  return Math.min(MAX_SETLIST_AUTOSCROLL_DELAY, Math.max(MIN_SETLIST_AUTOSCROLL_DELAY, Math.round(value)));
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
  // Как и с чернилами: произвольная строка из чужого/битого JSON уехала бы в CSS-переменную
  // и дала бы невидимые аккорды — принимаем только значения из палитры.
  // Как и с цветом: значение из чужого/битого JSON уехало бы в свёртку аккордов —
  // принимаем только известные режимы.
  const chordDisplay = raw?.chordDisplay && SONG_CHORD_DISPLAYS.includes(raw.chordDisplay) ? raw.chordDisplay : DEFAULT_SONG_VIEW_SETTINGS.chordDisplay;
  const chordColor = isChordColor(raw?.chordColor) ? raw.chordColor : DEFAULT_SONG_VIEW_SETTINGS.chordColor;
  const chordScale =
    typeof raw?.chordScale === 'number' && Number.isFinite(raw.chordScale)
      ? clampChordScale(raw.chordScale)
      : DEFAULT_SONG_VIEW_SETTINGS.chordScale;
  const inkPenOnly = typeof raw?.inkPenOnly === 'boolean' ? raw.inkPenOnly : DEFAULT_SONG_VIEW_SETTINGS.inkPenOnly;
  const inkInstant = typeof raw?.inkInstant === 'boolean' ? raw.inkInstant : DEFAULT_SONG_VIEW_SETTINGS.inkInstant;

  // Цвет принимаем только из палитры: произвольная строка из чужого/битого JSON уехала
  // бы в canvas как есть и дала бы невидимый штрих.
  const inkColor =
    typeof raw?.inkColor === 'string' && INK_COLORS.some((option) => option.value === raw.inkColor)
      ? raw.inkColor
      : DEFAULT_SONG_VIEW_SETTINGS.inkColor;

  const setlistAutoScroll =
    typeof raw?.setlistAutoScroll === 'boolean' ? raw.setlistAutoScroll : DEFAULT_SONG_VIEW_SETTINGS.setlistAutoScroll;
  const setlistAutoScrollDelay =
    typeof raw?.setlistAutoScrollDelay === 'number' && Number.isFinite(raw.setlistAutoScrollDelay)
      ? clampSetlistAutoScrollDelay(raw.setlistAutoScrollDelay)
      : DEFAULT_SONG_VIEW_SETTINGS.setlistAutoScrollDelay;

  // Старый JSON мог нести `mode` (до этого рефакторинга) — поле просто игнорируется:
  // `Partial<SongViewSettings>` больше не объявляет его, а sanitize строит объект заново.
  return { columns, fontSize, density, showChords, showHeader, chordDisplay, chordColor, chordScale, inkPenOnly, inkInstant, inkColor, setlistAutoScroll, setlistAutoScrollDelay };
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
