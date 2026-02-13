'use client';

import React from 'react';
import { ArrowLeft, Settings, ChevronRight } from 'lucide-react';
import { BibleReference, ReadingPlanDay } from '@/types';
import { getFullBookName } from '@/shared/utils/bible';

interface ReadingHeaderProps {
  currentReading: BibleReference | null;
  reading: BibleReference | null;
  currentChapter: number;
  day: ReadingPlanDay | null;
  onBack: () => void;
  onSettingsClick: () => void;
  onChapterPickerClick: () => void;
  onBookPickerClick: () => void;
}

export const ReadingHeader: React.FC<ReadingHeaderProps> = ({
  currentReading,
  reading,
  currentChapter,
  day,
  onBack,
  onSettingsClick,
  onChapterPickerClick,
  onBookPickerClick
}) => {
  const hasDayPlan = day && day.items && day.items.length > 0;
  const bookName = currentReading?.book || reading?.book;

  return (
    <header 
      className="reading-header sticky top-0 z-30 bg-white/95 dark:bg-stone-800/95 backdrop-blur-md border-b border-stone-100 dark:border-stone-700 flex items-center justify-between px-2 h-[56px] shadow-sm"
      data-testid="reading-header"
    >
      <button 
        onClick={onBack}
        className="reading-header-back-button p-3 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 active:scale-90 transition-transform"
        data-testid="reading-header-back-button"
      >
        <ArrowLeft size={22} />
      </button>
      
      {hasDayPlan ? (
        <button
          onClick={onChapterPickerClick}
          className="reading-header-title-button flex flex-col items-center cursor-pointer active:opacity-70"
          data-testid="reading-header-title-button"
        >
          <span 
            className="reading-header-book-name text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-0.5"
            data-testid="reading-header-book-name"
          >
            {bookName ? getFullBookName(bookName) : ''}
          </span>
          <div className="reading-header-chapter-container flex items-center space-x-1">
            <span 
              className="reading-header-chapter-number font-bold text-stone-900 dark:text-stone-100 text-sm leading-none -mt-0.5 relative top-[-1px]"
              data-testid="reading-header-chapter-number"
            >
              Глава {currentChapter}
            </span>
            <ChevronRight size={14} className="text-stone-400 dark:text-stone-500 rotate-90" />
          </div>
        </button>
      ) : (
        <button
          onClick={onBookPickerClick}
          className="reading-header-title-button flex flex-col items-center cursor-pointer active:opacity-70"
          data-testid="reading-header-title-button"
        >
          <span 
            className="reading-header-book-name text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-0.5"
            data-testid="reading-header-book-name"
          >
            {bookName ? getFullBookName(bookName) : ''}
          </span>
          <div className="reading-header-chapter-container flex items-center space-x-1">
            <span 
              className="reading-header-chapter-number font-bold text-stone-900 dark:text-stone-100 text-sm leading-none -mt-0.5 relative top-[-1px]"
              data-testid="reading-header-chapter-number"
            >
              Глава {currentChapter}
            </span>
            <ChevronRight size={14} className="text-stone-400 dark:text-stone-500 rotate-90" />
          </div>
        </button>
      )}

      <div className="reading-header-actions flex items-center">
        <button 
          onClick={onSettingsClick}
          className="reading-header-settings-button p-3 text-stone-400 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 active:scale-90 transition-transform"
          data-testid="reading-header-settings-button"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
};

