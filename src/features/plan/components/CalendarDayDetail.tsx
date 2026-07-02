'use client';

import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { ReadingPlanDay, BibleReference } from '@/types';
import { parseReadingItem, getFullBookName, getDayFirstReading } from '@/shared/utils/bible';

interface CalendarDayDetailProps {
  day: ReadingPlanDay;
  onToggleComplete: (dayId: number) => Promise<void>;
  onToggleItem: (dayId: number, itemNumber: number) => Promise<void>;
  onSelectReading: (day: ReadingPlanDay, reading: BibleReference) => void;
  onClose: () => void;
}

export const CalendarDayDetail: React.FC<CalendarDayDetailProps> = ({
  day,
  onToggleComplete,
  onToggleItem,
  onSelectReading,
  onClose
}) => {
  const handleChapterClick = (reading: BibleReference | null, rawText?: string) => {
    if (reading) {
      onClose();
      onSelectReading(day, reading);
    } else {
      console.warn('[CalendarDayDetail] could not parse reading item for navigation', rawText);
    }
  };

  const handleToggle = async (e: React.MouseEvent, itemNumber: number) => {
    e.preventDefault();
    e.stopPropagation();
    await onToggleItem(day.id, itemNumber);
  };

  const handleToggleComplete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await onToggleComplete(day.id);
  };

  const handleStartReading = () => {
    onClose(); // Закрываем BottomSheet перед переходом
    const reading = getDayFirstReading(day);
    if (reading) {
      onSelectReading(day, reading);
    }
  };

  return (
    <div className="space-y-2">
      {/* Chapters List */}
      <div className="space-y-1.5">
        {day.items && day.items.length > 0 
          ? day.items.map(item => {
              const reading = parseReadingItem(item.readText);
              const isRead = item.completed;

              return (
                <button
                  key={item.id}
                  onClick={() => handleChapterClick(reading, item.readText)}
                  className="w-full flex items-center gap-3 py-2 px-2 hover:bg-app-surface-muted rounded transition-colors text-left"
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => handleToggle(e, item.item)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isRead 
                        ? 'bg-app-success border-app-success' 
                        : 'bg-transparent border-app-border hover:border-app-border-strong'
                    }`}
                  >
                    {isRead && (
                      <Check 
                        size={12} 
                        className="text-app-text-inverse" 
                        strokeWidth={3} 
                      />
                    )}
                  </button>

                  {/* Chapter Text */}
                  <span 
                    className={`flex-1 text-sm ${
                      isRead ? 'text-app-text-subtle line-through' : 'text-app-text'
                    }`}
                  >
                    {reading ? `${getFullBookName(reading.book)} ${reading.chapter}` : item.readText}
                  </span>

                  {/* Arrow */}
                  <ChevronRight 
                    size={18} 
                    className="text-app-text-subtle flex-shrink-0" 
                  />
                </button>
              );
            })
          : day.readings?.map((reading, idx) => (
              <button
                key={`${day.id}-${idx}`}
                onClick={() => handleChapterClick(reading)}
                className="w-full flex items-center gap-3 py-2 px-2 hover:bg-app-surface-muted rounded transition-colors text-left"
              >
                {/* Checkbox */}
                <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-app-border flex items-center justify-center" />

                {/* Chapter Text */}
                <span className="flex-1 text-sm text-app-text">
                  {getFullBookName(reading.book)} {reading.chapter}
                </span>

                {/* Arrow */}
                <ChevronRight 
                  size={18} 
                  className="text-app-text-subtle flex-shrink-0" 
                />
              </button>
            ))
        }
      </div>

      {/* Start Reading Button */}
      <button
        onClick={handleStartReading}
        className="w-full bg-app-text text-app-text-inverse font-semibold py-2 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 text-sm"
      >
        {day.completed ? 'Перейти к чтению' : 'Начать чтение'}
      </button>
    </div>
  );
};
