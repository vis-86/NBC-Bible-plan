'use client';

import { cn } from '@/shared/utils/cn';

export interface SongToolStackProps {
  /** Слоты снизу вверх. Первый элемент массива — самый нижний. */
  children: React.ReactNode;
  hidden: boolean;
}

/**
 * Правый нижний край песни — единая точка входа для инструментов (сейчас автоскролл,
 * дальше карандаш заметок M10). Горизонтальный бюджет фиксирован (48px + поле) и не
 * растёт с числом слотов — стек растёт вверх (`flex-col-reverse`).
 *
 * Контракт на будущее (карандаш M10): активный инструмент забирает правый край целиком,
 * остальные слоты в это время скрыты — не выводить два раскрытых инструмента одновременно.
 */
export function SongToolStack({ children, hidden }: SongToolStackProps) {
  return (
    <div
      data-song-tool-stack
      className={cn(
        'pointer-events-none absolute right-3.5 bottom-3.5 flex flex-col-reverse items-center gap-2.5 pb-safe transition-[transform,opacity] duration-300',
        hidden ? 'translate-y-24 opacity-0' : 'translate-y-0 opacity-100'
      )}
    >
      {children}
    </div>
  );
}
