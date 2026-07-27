'use client';

import type React from 'react';
import { cn } from '@/shared/utils/cn';

export interface ChoiceGroupProps<T extends string | number> {
  options: readonly T[];
  value: T;
  onChange: (option: T) => void;
  labelFor: (option: T) => string;
  /** Tailwind нужны статически видимые классы — произвольное число колонок не поддерживается. */
  columns: 2 | 3;
  /** Дизейблит всю группу (например, пока идёт сохранение). */
  disabled?: boolean;
  /** Дизейблит отдельные опции, когда остальные остаются доступными. */
  disabledOptions?: readonly T[];
  /** Глиф слева от подписи (например, полоски-колонки). Рендерится с `aria-hidden`. */
  iconFor?: (option: T) => React.ReactNode;
  className?: string;
}

const selectedChoice = 'border-app-primary bg-app-primary-light text-app-primary font-medium';
const idleChoice = 'border-app-border text-app-text-secondary hover:border-app-border-strong';

/**
 * Ряд взаимоисключающих кнопок-опций (выравнивание, тема, режим просмотра и т.п.).
 * Извлечён из `ReadingSettingsForm` и `SongViewSettings`, где жил двумя почти
 * одинаковыми копиями. Высота кнопки `min-h-11` — тап-таргет ≥44px.
 */
export function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  labelFor,
  columns,
  disabled = false,
  disabledOptions,
  iconFor,
  className,
}: ChoiceGroupProps<T>) {
  const columnsClass = columns === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className={cn('grid gap-2', columnsClass, className)}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            disabled={disabled || (disabledOptions?.includes(option) ?? false)}
            onClick={() => onChange(option)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-app-md border-2 px-4 py-2 transition-all disabled:cursor-not-allowed disabled:opacity-50',
              selected ? selectedChoice : idleChoice,
            )}
          >
            {iconFor && <span aria-hidden="true">{iconFor(option)}</span>}
            {labelFor(option)}
          </button>
        );
      })}
    </div>
  );
}

export default ChoiceGroup;
