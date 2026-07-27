'use client';

import type React from 'react';
import { Minus, Plus } from 'lucide-react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { ChoiceGroup } from '@/shared/components/ui/ChoiceGroup';
import { RangeSlider } from '@/shared/components/ui/RangeSlider';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, SONG_WIDE_LAYOUT_QUERY } from '../hooks/useSongViewSettings';
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
            <ToggleRow label="Заголовок песни" checked={settings.showHeader} onChange={() => onSettingsChange({ showHeader: !settings.showHeader })} dataAttr="data-section-show-header" />
          </div>
        </SettingsGroup>
      </div>
    </BottomSheet>
  );
};

export default SongViewSettings;
