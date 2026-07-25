'use client';

import type React from 'react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import type { SongViewColumns, SongViewDensity, SongViewMode, SongViewSettings as SongViewSettingsValue } from '../hooks/useSongViewSettings';

export interface SongViewSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SongViewSettingsValue;
  onSettingsChange: (patch: Partial<SongViewSettingsValue>) => void;
}

/** Ниже этой ширины страница физически не вмещает 2 колонки читаемой ширины (§4.5). */
const TWO_COLUMNS_MIN_WIDTH_QUERY = '(min-width: 640px)';

const selectedChoice = 'border-app-primary bg-app-primary-light text-app-primary font-medium';
const idleChoice = 'border-app-border text-app-text-secondary hover:border-app-border-strong';

function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  labelFor,
  disabledOptions,
  columns,
}: {
  options: readonly T[];
  value: T;
  onChange: (option: T) => void;
  labelFor: (option: T) => string;
  disabledOptions?: readonly T[];
  columns: 2 | 3;
}) {
  const columnsClass = columns === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid gap-2 ${columnsClass}`}>
      {options.map((option) => {
        const disabled = disabledOptions?.includes(option) ?? false;
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            className={`min-h-11 rounded-app-md border-2 px-4 py-2 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              value === option ? selectedChoice : idleChoice
            }`}
          >
            {labelFor(option)}
          </button>
        );
      })}
    </div>
  );
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

const MODE_LABELS: Record<SongViewMode, string> = { scroll: 'Скролл', sheets: 'Листы', paged: 'Постранично' };
const DENSITY_LABELS: Record<SongViewDensity, string> = { comfortable: 'Свободно', compact: 'Компактно' };
const COLUMNS_LABELS: Record<SongViewColumns, string> = { 1: '1 колонка', 2: '2 колонки' };

/**
 * Настройки просмотра песни: режим раскладки, колонки, размер шрифта, плотность,
 * видимость аккордов и шапки. Заменяет `SongFontSettings` (только шрифт) — единая
 * панель на всё, что описано в §5/§7.
 */
export const SongViewSettings: React.FC<SongViewSettingsProps> = ({ isOpen, onClose, settings, onSettingsChange }) => {
  const canFitTwoColumns = useMediaQuery(TWO_COLUMNS_MIN_WIDTH_QUERY);
  const columnsDisabled = canFitTwoColumns ? [] : ([2] as const);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Настройки просмотра">
      <div data-song-view-settings className="space-y-6">
        <div data-section="font-size">
          <label className="mb-2 block text-sm font-medium text-app-text-secondary">Размер шрифта: {settings.fontSize}px</label>
          <input
            type="range"
            min="12"
            max="32"
            value={settings.fontSize}
            data-song-view-settings-font-slider
            onChange={(e) => onSettingsChange({ fontSize: parseInt(e.target.value, 10) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-app-sm bg-app-surface-muted accent-app-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-2"
          />
          <div className="mt-1 flex justify-between text-xs text-app-text-muted">
            <span>12px</span>
            <span>32px</span>
          </div>
        </div>

        <div data-section="mode">
          <label className="mb-2 block text-sm font-medium text-app-text-secondary">Режим просмотра</label>
          <ChoiceGroup options={['scroll', 'sheets', 'paged'] as const} value={settings.mode} onChange={(mode) => onSettingsChange({ mode })} labelFor={(m) => MODE_LABELS[m]} columns={3} />
        </div>

        <div data-section="columns">
          <label className="mb-2 block text-sm font-medium text-app-text-secondary">Колонки</label>
          <ChoiceGroup
            options={[1, 2] as const}
            value={settings.columns}
            onChange={(columns) => onSettingsChange({ columns })}
            labelFor={(c) => COLUMNS_LABELS[c]}
            disabledOptions={columnsDisabled}
            columns={2}
          />
          {!canFitTwoColumns && <p className="mt-2 text-xs text-app-text-muted">2 колонки доступны на планшете и шире.</p>}
        </div>

        <div data-section="density">
          <label className="mb-2 block text-sm font-medium text-app-text-secondary">Плотность</label>
          <ChoiceGroup options={['comfortable', 'compact'] as const} value={settings.density} onChange={(density) => onSettingsChange({ density })} labelFor={(d) => DENSITY_LABELS[d]} columns={2} />
        </div>

        <ToggleRow label="Показывать аккорды" checked={settings.showChords} onChange={() => onSettingsChange({ showChords: !settings.showChords })} dataAttr="data-section-show-chords" />
        <ToggleRow label="Показывать шапку" checked={settings.showHeader} onChange={() => onSettingsChange({ showHeader: !settings.showHeader })} dataAttr="data-section-show-header" />
      </div>
    </BottomSheet>
  );
};

export default SongViewSettings;
