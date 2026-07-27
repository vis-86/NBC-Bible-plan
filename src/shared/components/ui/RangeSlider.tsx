'use client';

import type React from 'react';
import { cn } from '@/shared/utils/cn';

export interface RangeSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  'aria-label'?: string;
  id?: string;
  className?: string;
  [key: `data-${string}`]: string | undefined;
}

/**
 * Обёртка над `<input type="range">` с интерактивной зоной 44px и тумбом 28px —
 * визуальный трек тоньше (6px), но зона захвата пальцем не уменьшается вместе с ним.
 * Трек/тумб описаны в globals.css (`.app-range`): псевдоэлементы `::-webkit-slider-*`
 * и `::-moz-range-*` Tailwind-утилитами не стилизуются.
 */
export const RangeSlider: React.FC<RangeSliderProps> = ({ value, onChange, min, max, step, disabled, className, ...rest }) => {
  return (
    <div className={cn('flex min-h-11 items-center', className)}>
      <input
        type="range"
        className="app-range h-11 w-full touch-manipulation cursor-pointer appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        {...rest}
      />
    </div>
  );
};

export default RangeSlider;
