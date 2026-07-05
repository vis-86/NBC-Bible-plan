'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { ReadingPlanDay, PlanItem } from '@/types';

type ReaderDisplayTheme = 'light' | 'dark' | 'sepia';

interface ReadingPlanFooterProps {
  day: ReadingPlanDay | null;
  currentItem: PlanItem | null;
  /**
   * Тема РИДЕРА (не приложения) — как у ReadingHeader: `dark:`-варианты тут
   * не годятся, они смотрят на data-theme приложения, а ридер может быть
   * тёмным при светлом приложении (и наоборот), плюс sepia.
   */
  displayTheme?: ReaderDisplayTheme;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * Цвета футера по теме ридера; surface совпадает с фоном читалки (как шапка).
 * Экспортируется: ReadingView переиспользует для запасного футера (чтение вне плана).
 */
export const readerFooterTheme: Record<
  ReaderDisplayTheme,
  {
    surface: string;
    nav: string;
    label: string;
    strong: string;
    dot: string;
    count: string;
    cta: string;
  }
> = {
  light: {
    surface: 'bg-white/95 border-stone-100 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]',
    nav: 'text-stone-400 hover:text-stone-900 hover:bg-stone-50',
    label: 'text-stone-400',
    strong: 'text-stone-700',
    dot: 'text-stone-300',
    count: 'text-stone-500',
    cta: 'bg-stone-900 text-white hover:bg-stone-800',
  },
  dark: {
    surface: 'bg-stone-900/95 border-stone-800 shadow-[0_-4px_12px_rgba(0,0,0,0.3)]',
    nav: 'text-stone-500 hover:text-stone-100 hover:bg-stone-800/50',
    label: 'text-stone-500',
    strong: 'text-stone-300',
    dot: 'text-stone-600',
    count: 'text-stone-400',
    cta: 'bg-stone-700 text-white hover:bg-stone-600',
  },
  sepia: {
    surface: 'bg-amber-50/95 border-amber-200/60 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]',
    nav: 'text-stone-500 hover:text-stone-900 hover:bg-amber-100/60',
    label: 'text-stone-500',
    strong: 'text-stone-700',
    dot: 'text-stone-400',
    count: 'text-stone-500',
    cta: 'bg-stone-900 text-white hover:bg-stone-800',
  },
};

export const ReadingPlanFooter: React.FC<ReadingPlanFooterProps> = ({
  day,
  currentItem,
  displayTheme = 'light',
  onPrev,
  onNext,
  canPrev,
  canNext,
}) => {
  if (!day) return null;

  const theme = readerFooterTheme[displayTheme];
  const currentYear = new Date().getFullYear();
  const totalItems = day.totalItems || day.items.length;
  const currentItemIndex = currentItem ? currentItem.item : 0;

  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-40 ${theme.surface} backdrop-blur-md border-t px-4 pb-safe`}
      data-testid="reading-plan-footer"
    >
      <div className="max-w-xl mx-auto flex items-center justify-between h-[80px]">
        {/* Кнопка назад */}
        <button
          onClick={onPrev}
          disabled={!canPrev}
          className={`p-3 ${theme.nav} active:scale-90 disabled:opacity-20 transition-all rounded-full`}
          aria-label="Предыдущая глава"
        >
          <ChevronLeft size={28} strokeWidth={1.5} />
        </button>

        {/* Информация о плане */}
        <div className="flex flex-col items-center justify-center text-center select-none">
          <span className={`text-[11px] font-medium ${theme.label} uppercase tracking-tight leading-tight`}>
            План чтения {currentYear}
          </span>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-sm font-semibold ${theme.strong}`}>
              День {day.id}
            </span>
            <span className={theme.dot}>•</span>
            <span className={`text-sm font-medium ${theme.count}`}>
              {currentItemIndex} из {totalItems}
            </span>
          </div>
        </div>

        {/* Кнопка вперед / завершить */}
        <button
          onClick={onNext}
          className={`w-12 h-12 flex items-center justify-center ${theme.cta} shadow-md active:scale-95 transition-all rounded-full`}
          aria-label={canNext ? "Следующая глава" : "Завершить день"}
        >
          {canNext ? <ChevronRight size={24} strokeWidth={2.5} /> : <Check size={24} strokeWidth={2.5} />}
        </button>
      </div>
    </footer>
  );
};
