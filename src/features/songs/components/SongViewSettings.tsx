'use client';

import type React from 'react';
import { Minus, Plus } from 'lucide-react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { ChoiceGroup } from '@/shared/components/ui/ChoiceGroup';
import { RangeSlider } from '@/shared/components/ui/RangeSlider';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { MAX_CHORD_SCALE, MAX_FONT_SIZE, MIN_CHORD_SCALE, MIN_FONT_SIZE, SONG_WIDE_LAYOUT_QUERY, clampChordScale } from '../hooks/useSongViewSettings';
import { CHORD_COLORS, CUSTOM_CHORD_COLOR_FALLBACK, isCustomChordColor } from '../lib/chordColors';
import type { SongChordDisplay } from '../lib/chordDisplay';
import type { SongViewColumns, SongViewDensity, SongViewSettings as SongViewSettingsValue } from '../hooks/useSongViewSettings';

export interface SongViewSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SongViewSettingsValue;
  onSettingsChange: (patch: Partial<SongViewSettingsValue>) => void;
}

function ToggleRow({ label, checked, onChange, dataAttr }: { label: string; checked: boolean; onChange: () => void; dataAttr?: string }) {
  return (
    <div className="flex items-center justify-between" {...(dataAttr ? { [dataAttr]: '' } : {})}>
      <label className="text-sm font-medium text-app-text-secondary">{label}</label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className="relative flex h-11 w-14 -mr-1 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
      >
        <span aria-hidden className={`relative h-6 w-12 rounded-full transition-colors ${checked ? 'bg-app-primary' : 'bg-app-surface-muted'}`}>
          <span
            className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform dark:ring-white/10 ${
              checked ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </span>
      </button>
    </div>
  );
}

/** Заголовок + разделение групп (A: плоский список → 3 смысловые группы). */
function SettingsGroup({ title, first, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={first ? undefined : 'border-t border-app-border pt-5'}>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-app-text-muted">{title}</h3>
      {children}
    </div>
  );
}

/** Глиф колонок (D): вертикальные полоски вместо/рядом с подписью — читаются быстрее текста. */
function ColumnsGlyph({ columns }: { columns: SongViewColumns }) {
  return (
    <span className="flex gap-0.5">
      <span className="h-4 w-1 rounded-full bg-current" />
      {columns === 2 && <span className="h-4 w-1 rounded-full bg-current" />}
    </span>
  );
}

/**
 * Выбор цвета аккордов: фиксированная палитра кружками, а не color picker — попасть
 * в «свой» цвет нужно одним тапом (та же логика, что у палитры пометок).
 */
function ChordColorRow({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div data-section-chord-color>
      <label className="mb-2 block text-sm font-medium text-app-text-secondary">Цвет аккордов</label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цвет аккордов">
        {CHORD_COLORS.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              title={option.label}
              data-chord-color={option.value}
              onClick={() => onChange(option.value)}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary ${
                selected ? 'ring-2 ring-app-primary' : ''
              }`}
            >
              <span aria-hidden className="h-6 w-6 rounded-full border border-app-border" style={{ backgroundColor: option.swatch }} />
            </button>
          );
        })}
        <CustomChordColorSwatch value={value} onChange={onChange} />
      </div>
    </div>
  );
}

/**
 * Произвольный цвет — нативный `<input type="color">` в кружке палитры. Системный
 * пикер вместо своего: он уже умеет и HSV-поле, и пипетку, и сохранённые цвета,
 * а на планшете открывается тем же диалогом, к которому человек привык.
 */
function CustomChordColorSwatch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const custom = isCustomChordColor(value);
  // У сентинелов («по теме», «как текст») hex-эквивалента нет — пикеру нужен валидный
  // стартовый цвет, иначе он откроется на чёрном и «сбросит» выбор одним касанием.
  const pickerValue = custom ? value : CUSTOM_CHORD_COLOR_FALLBACK;

  return (
    <label
      data-section-chord-color-custom
      title="Свой цвет"
      className={`relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-within:outline-none focus-within:ring-2 focus-within:ring-app-primary ${
        custom ? 'ring-2 ring-app-primary' : ''
      }`}
    >
      <span className="sr-only">Свой цвет</span>
      <span
        aria-hidden
        className="h-6 w-6 rounded-full border border-app-border"
        style={{
          // Радужная заливка, пока свой цвет не выбран: кружок обязан читаться как
          // «выбрать цвет», а не как ещё один готовый вариант палитры.
          background: custom ? value : 'conic-gradient(#dc2626, #eab308, #16a34a, #0284c7, #7c3aed, #db2777, #dc2626)',
        }}
      />
      <input
        type="color"
        value={pickerValue}
        aria-label="Свой цвет"
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

/**
 * Кегль аккордов — в процентах от размера лирики, а не в px: настройка обязана
 * пережить смену размера текста, иначе подобранную пару приходится набирать заново.
 */
function ChordScaleRow({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div data-section-chord-scale>
      <label className="mb-2 block text-sm font-medium text-app-text-secondary">Размер аккордов</label>
      <div className="flex items-center gap-2">
        <RangeSlider
          value={value}
          min={MIN_CHORD_SCALE}
          max={MAX_CHORD_SCALE}
          step={5}
          aria-label="Размер аккордов"
          data-song-view-settings-chord-scale-slider
          onChange={(next) => onChange(clampChordScale(next))}
          className="flex-1"
        />
        <span className="w-12 shrink-0 text-right text-sm tabular-nums text-app-text-secondary">{value}%</span>
      </div>
    </div>
  );
}

const CHORD_DISPLAY_LABELS: Record<SongChordDisplay, string> = { full: 'Полные', noBass: 'Без баса', bassOnly: 'Только бас' };
const CHORD_DISPLAY_HINTS: Record<SongChordDisplay, string> = {
  full: 'G/B — как в песне.',
  noBass: 'G/B → G — аккорд без басовой ноты.',
  bassOnly: 'G/B → B, Am7 → A — только нижняя нота.',
};

/**
 * Свёртка аккордов: полные / без баса / только бас. Один ряд взаимоисключающих опций,
 * а не пара тумблеров — «без баса» и «только бас» одновременно не существуют.
 */
function ChordDisplayRow({ value, onChange }: { value: SongChordDisplay; onChange: (value: SongChordDisplay) => void }) {
  return (
    <div data-section-chord-display>
      <label className="mb-2 block text-sm font-medium text-app-text-secondary">Вид аккордов</label>
      <ChoiceGroup options={['full', 'noBass', 'bassOnly'] as const} value={value} onChange={onChange} labelFor={(d) => CHORD_DISPLAY_LABELS[d]} columns={3} />
      <p className="mt-2 text-xs text-app-text-muted" data-song-view-settings-chord-display-hint>
        {CHORD_DISPLAY_HINTS[value]}
      </p>
    </div>
  );
}

const DENSITY_LABELS: Record<SongViewDensity, string> = { comfortable: 'Свободно', compact: 'Компактно' };
const COLUMNS_LABELS: Record<SongViewColumns, string> = { 1: '1 колонка', 2: '2 колонки' };

/**
 * Настройки просмотра песни: колонки (режим листов выводится из них — см.
 * `resolveSongViewMode`), размер шрифта, плотность, видимость аккордов и шапки.
 * Три смысловые группы вместо плоского списка (§UX-решения плана
 * feature-song-settings-ux): «Текст» → «Раскладка» → «Отображение».
 */
export const SongViewSettings: React.FC<SongViewSettingsProps> = ({ isOpen, onClose, settings, onSettingsChange }) => {
  // На телефоне вторая колонка не имеет смысла — контрол скрыт целиком, а не
  // задизейблен: настройка, которая ни на что не влияет, только шумит.
  const isWideLayout = useMediaQuery(SONG_WIDE_LAYOUT_QUERY);

  const setFontSize = (value: number) => onSettingsChange({ fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value)) });

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Настройки просмотра">
      <div data-song-view-settings className="space-y-5">
        <SettingsGroup title="Текст" first>
          <div data-section="font-size">
            <label className="mb-2 block text-sm font-medium text-app-text-secondary">Размер шрифта</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Уменьшить шрифт"
                disabled={settings.fontSize <= MIN_FONT_SIZE}
                onClick={() => setFontSize(settings.fontSize - 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-app-md border-2 border-app-border text-app-text-secondary transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus size={16} />
              </button>
              <RangeSlider
                value={settings.fontSize}
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                aria-label="Размер шрифта"
                data-song-view-settings-font-slider
                onChange={setFontSize}
                className="flex-1"
              />
              <button
                type="button"
                aria-label="Увеличить шрифт"
                disabled={settings.fontSize >= MAX_FONT_SIZE}
                onClick={() => setFontSize(settings.fontSize + 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-app-md border-2 border-app-border text-app-text-secondary transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} />
              </button>
              <span className="w-10 shrink-0 text-right text-sm tabular-nums text-app-text-secondary">{settings.fontSize}px</span>
            </div>
          </div>

          <div data-section="density" className="mt-4">
            <label className="mb-2 block text-sm font-medium text-app-text-secondary">Плотность</label>
            <ChoiceGroup options={['comfortable', 'compact'] as const} value={settings.density} onChange={(density) => onSettingsChange({ density })} labelFor={(d) => DENSITY_LABELS[d]} columns={2} />
          </div>
        </SettingsGroup>

        {isWideLayout && (
          <SettingsGroup title="Раскладка">
            <div data-section="columns">
              <label className="mb-2 block text-sm font-medium text-app-text-secondary">Колонки</label>
              <ChoiceGroup
                options={[1, 2] as const}
                value={settings.columns}
                onChange={(columns) => onSettingsChange({ columns })}
                labelFor={(c) => COLUMNS_LABELS[c]}
                iconFor={(c) => <ColumnsGlyph columns={c} />}
                columns={2}
              />
              <p className="mt-2 text-xs text-app-text-muted" data-song-view-settings-mode-hint>
                Одна колонка — непрерывный скролл. Две — листы с перелистыванием вниз.
              </p>
            </div>
          </SettingsGroup>
        )}

        <SettingsGroup title="Отображение">
          <div className="space-y-4">
            <ToggleRow label="Аккорды" checked={settings.showChords} onChange={() => onSettingsChange({ showChords: !settings.showChords })} dataAttr="data-section-show-chords" />
            {/* Цвет показываем только когда аккорды включены: скрытым аккордам он ни на что не влияет. */}
            {settings.showChords && <ChordDisplayRow value={settings.chordDisplay} onChange={(chordDisplay) => onSettingsChange({ chordDisplay })} />}
            {settings.showChords && <ChordColorRow value={settings.chordColor} onChange={(chordColor) => onSettingsChange({ chordColor })} />}
            {settings.showChords && <ChordScaleRow value={settings.chordScale} onChange={(chordScale) => onSettingsChange({ chordScale })} />}
            <ToggleRow label="Заголовок песни" checked={settings.showHeader} onChange={() => onSettingsChange({ showHeader: !settings.showHeader })} dataAttr="data-section-show-header" />
          </div>
        </SettingsGroup>

        {/* Группа «Пометки» («только стилусом» и «перо сразу рисует») временно убрана —
            см. INK_PEN_ONLY / INK_INSTANT в src/app/dashboard/song/page.tsx. */}
      </div>
    </BottomSheet>
  );
};

export default SongViewSettings;
