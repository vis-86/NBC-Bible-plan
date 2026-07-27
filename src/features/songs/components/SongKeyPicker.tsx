'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { cn } from '@/shared/utils/cn';
import { keyByOffset, keyFromParts, semitonesBetween, splitKey, type KeyAccidental, type KeyBase, type SongKeySource } from '../lib/songKey';

export interface SongKeyPickerProps {
  /** Звучащая действующая тональность (§10.1) — она же выбранная опция. */
  value: string;
  /** Откуда она взялась: подпись рядом со значением. */
  source: SongKeySource;
  /** Исходная тональность песни — точка отсчёта слайдера полутонов. */
  originalKey?: string;
  /** Тональности в том же ладу, что исходная (`keyOptions`). Используются для валидации выбора. */
  options: readonly string[];
  onChange: (key: string) => void;
  /** Сброс к основной/исходной — кнопка видна только при личной тональности. */
  onReset: () => void;
  /** Каподастр в ладах, 0..9. */
  capo: number;
  onCapoChange: (capo: number) => void;
  /** Тональность форм аккордов при текущем капо (`keyByOffset(value, -capo)`). */
  shapeKey?: string;
  className?: string;
  /** Уведомляет родителя об открытии/закрытии шторки (гейт перекрывающих оверлеев страницы). */
  onOpenChange?: (open: boolean) => void;
}

/** Подписи уровней §10.1. Названия нот — латиницей, как в корпусе и в аккордах на листе. */
const SOURCE_LABEL: Record<SongKeySource, string> = {
  personal: 'моя',
  setlist: 'сет',
  default: 'по умолчанию',
  original: '',
};

const BASES: readonly KeyBase[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACCIDENTALS: readonly { value: KeyAccidental; label: string }[] = [
  { value: 'b', label: '♭' },
  { value: '', label: '♮' },
  { value: '#', label: '#' },
];
const CAPO_MAX = 9;
const SEMITONE_MIN = -6;
const SEMITONE_MAX = 6;

/** Знаковый сдвиг −6…+6 от исходной к действующей тональности (тритон отображается как ±6). */
function signedOffset(originalKey: string | undefined, value: string): number {
  const normalized = semitonesBetween(originalKey, value); // 0..11
  return normalized > SEMITONE_MAX ? normalized - 12 : normalized;
}

/**
 * Выбор рабочей тональности песни («Транспонирование»): триггер-кнопка в шапке страницы
 * раскрывает bottom-sheet с основой+знаком, слайдером полутонов и каподастром.
 *
 * Каподастр не тональность: он не трогает `value`/`onChange`, а живёт своим `onCapoChange`
 * и показывает лишь форму аккордов (`shapeKey`) — звучит песня в той же тональности.
 */
export function SongKeyPicker({
  value,
  source,
  originalKey,
  options,
  onChange,
  onReset,
  capo,
  onCapoChange,
  shapeKey,
  className,
  onOpenChange,
}: SongKeyPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const sourceLabel = SOURCE_LABEL[source];

  const open = () => {
    setIsOpen(true);
    onOpenChange?.(true);
  };

  const close = () => {
    setIsOpen(false);
    onOpenChange?.(false);
  };

  const parts = splitKey(value);
  const minor = parts?.minor ?? false;
  const currentBase = parts?.base;
  const currentAccidental = parts?.accidental ?? '';
  const offset = signedOffset(originalKey, value);

  const selectParts = (base: KeyBase, accidental: KeyAccidental) => {
    const next = keyFromParts(base, accidental, minor);
    if (next && next !== value) onChange(next);
  };

  const selectOffset = (semitones: number) => {
    const next = keyByOffset(originalKey, semitones);
    if (next && next !== value) onChange(next);
  };

  const handleReset = () => {
    onReset();
    close();
  };

  return (
    <div className={cn('inline-flex', className)} data-song-key-picker>
      <button
        type="button"
        data-song-key-picker-toggle
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Тональность ${value}${sourceLabel ? `, ${sourceLabel}` : ''}${capo > 0 ? `, каподастр ${capo}` : ''}`}
        onClick={open}
        // Габариты выровнены с кнопкой настроек справа (иконка + p-2 ≈ h-9): фиксированная
        // высота и min-width держат шапку однородной вне зависимости от длины тональности.
        className="inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-app-sm bg-app-primary px-3 text-sm font-medium text-app-text-inverse transition-colors duration-150 hover:bg-app-primary-hover active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-2"
      >
        {sourceLabel && (
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-app-text-inverse/80" data-song-key-picker-source-dot />
        )}
        <span data-song-key-picker-value>{value}</span>
        {capo > 0 && (
          <span className="text-sm opacity-90" data-song-key-picker-capo-badge>
            {capo}
          </span>
        )}
      </button>

      <BottomSheet isOpen={isOpen} onClose={close} title="Транспонирование">
        <div data-song-key-picker-panel className="space-y-6 pb-2">
          <div data-section="base">
            <label className="mb-2 block text-sm font-medium text-app-text-secondary">Выберите основу</label>
            <div className="grid grid-cols-7 gap-2">
              {BASES.map((base) => {
                const selected = base === currentBase;
                return (
                  <button
                    key={base}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectParts(base, currentAccidental)}
                    className={cn(
                      'min-h-11 rounded-app-md border-2 px-1 py-2 text-center transition-all',
                      selected ? 'border-app-primary bg-app-primary-light font-medium text-app-primary' : 'border-app-border text-app-text-secondary hover:border-app-border-strong',
                    )}
                  >
                    {base}
                  </button>
                );
              })}
            </div>
          </div>

          <div data-section="accidental">
            <label className="mb-2 block text-sm font-medium text-app-text-secondary">Знак</label>
            <div className="grid grid-cols-3 gap-2">
              {ACCIDENTALS.map(({ value: acc, label }) => {
                const selected = acc === currentAccidental;
                return (
                  <button
                    key={acc || 'natural'}
                    type="button"
                    aria-pressed={selected}
                    aria-label={acc === 'b' ? 'Бемоль' : acc === '#' ? 'Диез' : 'Без знака'}
                    onClick={() => currentBase && selectParts(currentBase, acc)}
                    className={cn(
                      'min-h-11 rounded-app-md border-2 px-4 py-2 text-lg transition-all',
                      selected ? 'border-app-primary bg-app-primary-light font-medium text-app-primary' : 'border-app-border text-app-text-secondary hover:border-app-border-strong',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-sm text-app-text-secondary" data-song-key-picker-current>
            Тональность: <span className="font-bold text-app-text">{value}</span>
          </p>

          <div data-section="semitones">
            <label className="mb-2 block text-sm font-medium text-app-text-secondary">Полутона: {offset > 0 ? `+${offset}` : offset}</label>
            <input
              type="range"
              min={SEMITONE_MIN}
              max={SEMITONE_MAX}
              value={offset}
              data-song-key-picker-semitone-slider
              onChange={(e) => selectOffset(parseInt(e.target.value, 10))}
              className="h-2 w-full cursor-pointer appearance-none rounded-app-sm bg-app-surface-muted accent-app-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-2"
            />
            <div className="mt-1 flex justify-between text-xs text-app-text-muted">
              <span>{SEMITONE_MIN}</span>
              <span>0</span>
              <span>+{SEMITONE_MAX}</span>
            </div>
          </div>

          <div data-section="capo">
            <label className="mb-2 block text-sm font-medium text-app-text-secondary" data-song-key-picker-capo-label>
              {capo > 0 && shapeKey ? (
                <>
                  Каподастр на <span className="font-bold text-app-primary">{capo}</span> ладу, играйте как в{' '}
                  <span className="font-bold text-app-primary">{shapeKey}</span>
                </>
              ) : (
                'Каподастр'
              )}
            </label>
            <input
              type="range"
              min={0}
              max={CAPO_MAX}
              value={capo}
              data-song-key-picker-capo-slider
              onChange={(e) => onCapoChange(parseInt(e.target.value, 10))}
              className="h-2 w-full cursor-pointer appearance-none rounded-app-sm bg-app-surface-muted accent-app-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-2"
            />
            <div className="mt-1 flex justify-between text-xs text-app-text-muted">
              {Array.from({ length: CAPO_MAX + 1 }, (_, fret) => (
                <span key={fret}>{fret}</span>
              ))}
            </div>
          </div>

          {source === 'personal' && (
            <button
              type="button"
              data-song-key-picker-reset
              onClick={handleReset}
              className="inline-flex min-h-11 items-center gap-2 rounded-app-md px-3 text-app-text-secondary transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
            >
              <RotateCcw size={16} />
              Сбросить к основной
            </button>
          )}

          {/* Список валидных тональностей для скринридера — источник опций явный (§10.3),
              выбор идёт через основу+знак/слайдер, но набор ограничен `options`. */}
          <span className="sr-only" data-song-key-picker-options>
            {options.join(' ')}
          </span>
        </div>
      </BottomSheet>
    </div>
  );
}

export default SongKeyPicker;
