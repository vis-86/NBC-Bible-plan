'use client';

import React from 'react';
import { Settings, ChevronRight } from 'lucide-react';
import { BibleReference, ReadingPlanDay, PlanItem } from '@/types';
import { getFullBookName } from '@/shared/utils/bible';

type ReaderDisplayTheme = 'light' | 'dark' | 'sepia';

interface ReadingHeaderProps {
  currentReading: BibleReference | null;
  reading: BibleReference | null;
  currentChapter: number;
  day: ReadingPlanDay | null;
  currentItem?: PlanItem | null;
  totalItems?: number;
  /**
   * Тема РИДЕРА (не приложения!): может быть dark при светлой теме приложения
   * и наоборот, плюс sepia. Поэтому цвета шапки задаются по этому пропу, а не
   * через `dark:`-варианты (те смотрят на data-theme приложения).
   */
  displayTheme?: ReaderDisplayTheme;
  onSettingsClick: () => void;
  onChapterPickerClick: () => void;
  onBookPickerClick: () => void;
}

/**
 * Цвета шапки по теме ридера. Фон шапки красит бровь (pt-safe) — он же
 * дублируется в meta theme-color (см. READER_STATUS_BAR_COLORS в ReadingView).
 */
const headerTheme: Record<
  ReaderDisplayTheme,
  { surface: string; textMuted: string; textStrong: string; action: string; badge: string }
> = {
  light: {
    surface: 'bg-white/95 border-stone-100',
    textMuted: 'text-stone-400',
    textStrong: 'text-stone-900',
    action: 'text-stone-500 hover:text-stone-900',
    badge: 'bg-stone-100 text-stone-500',
  },
  // dark: фон шапки = фон читалки (stone-900, см. themeClasses в ReadingView) —
  // stone-800 давал видимый перепад между бровью/шапкой и текстом (фидбек).
  dark: {
    surface: 'bg-stone-900/95 border-stone-800',
    textMuted: 'text-stone-500',
    textStrong: 'text-stone-100',
    action: 'text-stone-400 hover:text-stone-100',
    badge: 'bg-stone-800 text-stone-400',
  },
  sepia: {
    surface: 'bg-amber-50/95 border-amber-200/60',
    textMuted: 'text-stone-500',
    textStrong: 'text-stone-900',
    action: 'text-stone-500 hover:text-stone-900',
    badge: 'bg-amber-100 text-stone-600',
  },
};

export const ReadingHeader: React.FC<ReadingHeaderProps> = ({
  currentReading,
  reading,
  currentChapter,
  day,
  currentItem,
  totalItems,
  displayTheme = 'light',
  onSettingsClick,
  onChapterPickerClick,
  onBookPickerClick
}) => {
  const hasDayPlan = day && day.items && day.items.length > 0;
  const bookName = currentReading?.book || reading?.book;
  const theme = headerTheme[displayTheme];

  // «День N» без счётчика, если currentItem ещё не известен (не переносим
  // бессмысленное «0 из Y» из старого футера).
  const planBadgeText = day
    ? currentItem
      ? `День ${day.id} · ${currentItem.item} из ${totalItems ?? day.totalItems ?? day.items.length}`
      : `День ${day.id}`
    : null;

  return (
    <header
      className={`reading-header sticky top-0 z-30 ${theme.surface} backdrop-blur-md border-b flex items-center justify-between px-2 min-h-[56px] pt-safe shadow-sm`}
      data-testid="reading-header"
    >
      {/* Спейсер слева, равный ширине кнопки настроек — центр не съезжает без стрелки назад. */}
      <div className="reading-header-spacer w-11 shrink-0" aria-hidden="true" />

      <div className="reading-header-center flex flex-col items-center">
        <button
          onClick={hasDayPlan ? onChapterPickerClick : onBookPickerClick}
          className="reading-header-title-button flex flex-col items-center cursor-pointer active:opacity-70"
          data-testid="reading-header-title-button"
        >
          <span
            className={`reading-header-book-name text-xs font-bold ${theme.textMuted} uppercase tracking-widest mb-0.5`}
            data-testid="reading-header-book-name"
          >
            {bookName ? getFullBookName(bookName) : ''}
          </span>
          <div className="reading-header-chapter-container flex items-center space-x-1">
            <span
              className={`reading-header-chapter-number font-bold ${theme.textStrong} text-sm leading-none -mt-0.5 relative top-[-1px]`}
              data-testid="reading-header-chapter-number"
            >
              Глава {currentChapter}
            </span>
            <ChevronRight size={14} className={`${theme.textMuted} rotate-90`} />
          </div>
        </button>

        {planBadgeText && (
          <span
            className={`reading-header-plan-badge mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${theme.badge}`}
            data-testid="reading-header-plan-badge"
          >
            {planBadgeText}
          </span>
        )}
      </div>

      <div className="reading-header-actions flex items-center">
        <button
          onClick={onSettingsClick}
          className={`reading-header-settings-button p-3 ${theme.action} active:scale-90 transition-transform`}
          data-testid="reading-header-settings-button"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
};
