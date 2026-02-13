'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { ReadingPlanDay, PlanItem } from '@/types';

interface ReadingPlanFooterProps {
  day: ReadingPlanDay | null;
  currentItem: PlanItem | null;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}

export const ReadingPlanFooter: React.FC<ReadingPlanFooterProps> = ({
  day,
  currentItem,
  onPrev,
  onNext,
  canPrev,
  canNext,
}) => {
  if (!day) return null;

  const currentYear = new Date().getFullYear();
  const totalItems = day.totalItems || day.items.length;
  const currentItemIndex = currentItem ? currentItem.item : 0;

  return (
    <footer 
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-800/95 backdrop-blur-md border-t border-stone-100 dark:border-stone-700 px-4 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.3)]"
      data-testid="reading-plan-footer"
    >
      <div className="max-w-xl mx-auto flex items-center justify-between h-[80px]">
        {/* Кнопка назад */}
        <button
          onClick={onPrev}
          disabled={!canPrev}
          className="p-3 text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700/50 active:scale-90 disabled:opacity-20 transition-all rounded-full"
          aria-label="Предыдущая глава"
        >
          <ChevronLeft size={28} strokeWidth={1.5} />
        </button>

        {/* Информация о плане */}
        <div className="flex flex-col items-center justify-center text-center select-none">
          <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500 uppercase tracking-tight leading-tight">
            План чтения {currentYear}
          </span>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              День {day.id}
            </span>
            <span className="text-stone-300 dark:text-stone-600">•</span>
            <span className="text-sm font-medium text-stone-500 dark:text-stone-400">
              {currentItemIndex} из {totalItems}
            </span>
          </div>
        </div>

        {/* Кнопка вперед / завершить */}
        <button
          onClick={onNext}
          className="w-12 h-12 flex items-center justify-center bg-stone-900 dark:bg-stone-700 text-white shadow-md hover:bg-stone-800 dark:hover:bg-stone-600 active:scale-95 transition-all rounded-full"
          aria-label={canNext ? "Следующая глава" : "Завершить день"}
        >
          {canNext ? <ChevronRight size={24} strokeWidth={2.5} /> : <Check size={24} strokeWidth={2.5} />}
        </button>
      </div>
    </footer>
  );
};
