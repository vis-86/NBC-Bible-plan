'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ChoiceGroup } from '@/shared/components/ui/ChoiceGroup';
import { cn } from '@/shared/utils/cn';
import type { SongKeySource } from '../lib/songKey';

export interface SongKeyPickerProps {
  /** Действующая тональность (§10.1) — она же выбранная опция. */
  value: string;
  /** Откуда она взялась: подпись рядом со значением. */
  source: SongKeySource;
  /** Тональности в том же ладу, что исходная (`keyOptions`). */
  options: readonly string[];
  onChange: (key: string) => void;
  /** Сброс к основной/исходной — кнопка видна только при личной тональности. */
  onReset: () => void;
  className?: string;
}

/** Подписи уровней §10.1. Названия нот — латиницей, как в корпусе и в аккордах на листе. */
const SOURCE_LABEL: Record<SongKeySource, string> = {
  personal: 'моя',
  setlist: 'сет',
  default: 'по умолчанию',
  original: '',
};

/**
 * Выбор рабочей тональности песни. Раскрывающаяся панель позиционируется абсолютно:
 * в режимах `sheets`/`paged` высота шапки участвует в расчёте листа, и панель в потоке
 * пересобирала бы разбивку на каждое открытие.
 */
export function SongKeyPicker({ value, source, options, onChange, onReset, className }: SongKeyPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const sourceLabel = SOURCE_LABEL[source];

  const handleChange = (key: string) => {
    onChange(key);
    setIsOpen(false);
  };

  const handleReset = () => {
    onReset();
    setIsOpen(false);
  };

  return (
    <div className={cn('relative inline-flex items-center gap-1', className)} data-song-key-picker>
      <button
        type="button"
        data-song-key-picker-toggle
        aria-expanded={isOpen}
        aria-label="Тональность"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-app-sm px-2 text-app-text-secondary transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
      >
        <span className="font-medium text-app-text" data-song-key-picker-value>
          {value}
        </span>
        {sourceLabel && <span className="text-sm text-app-text-muted">({sourceLabel})</span>}
      </button>

      {source === 'personal' && (
        <button
          type="button"
          data-song-key-picker-reset
          aria-label="Сбросить тональность"
          onClick={handleReset}
          className="flex h-11 w-11 items-center justify-center rounded-app-sm text-app-text-muted transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
        >
          <RotateCcw size={16} />
        </button>
      )}

      {isOpen && (
        <div
          data-song-key-picker-options
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-app-md border border-app-border bg-app-surface-elevated p-2 shadow-app-md"
        >
          <ChoiceGroup options={options} value={value} onChange={handleChange} labelFor={(key) => key} columns={3} />
        </div>
      )}
    </div>
  );
}

export default SongKeyPicker;
