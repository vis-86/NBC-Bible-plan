'use client';

import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { ReadingPlanDay, BibleReference } from '@/types';
import { parseReadingItem, getFullBookName } from '@/shared/utils/bible';

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
  const handleChapterClick = (reading: BibleReference | null) => {
    if (reading) {
      onClose(); // Закрываем BottomSheet перед переходом
      onSelectReading(day, reading);
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

  // Находим первую непрочитанную главу для кнопки "Начать чтение"
  const firstUnreadItem = day.items?.find(item => !item.completed);
  const firstUnreadReading = firstUnreadItem ? parseReadingItem(firstUnreadItem.readText) : null;

  const handleStartReading = () => {
    onClose(); // Закрываем BottomSheet перед переходом
    if (firstUnreadReading) {
      onSelectReading(day, firstUnreadReading);
    } else if (day.items && day.items.length > 0) {
      // Если все прочитано, открываем первую главу
      const firstReading = parseReadingItem(day.items[0].readText);
      if (firstReading) {
        onSelectReading(day, firstReading);
      }
    } else if (day.readings && day.readings.length > 0) {
      onSelectReading(day, day.readings[0]);
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
                  onClick={() => handleChapterClick(reading)}
                  className="w-full flex items-center gap-3 py-2 px-2 hover:bg-stone-50 rounded transition-colors text-left"
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => handleToggle(e, item.item)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isRead 
                        ? 'bg-green-500 border-green-500' 
                        : 'bg-transparent border-stone-300 hover:border-stone-400'
                    }`}
                  >
                    {isRead && (
                      <Check 
                        size={12} 
                        className="text-white" 
                        strokeWidth={3} 
                      />
                    )}
                  </button>

                  {/* Chapter Text */}
                  <span 
                    className={`flex-1 text-sm ${
                      isRead ? 'text-stone-400 line-through' : 'text-stone-800'
                    }`}
                  >
                    {reading ? `${getFullBookName(reading.book)} ${reading.chapter}` : item.readText}
                  </span>

                  {/* Arrow */}
                  <ChevronRight 
                    size={18} 
                    className="text-stone-300 flex-shrink-0" 
                  />
                </button>
              );
            })
          : day.readings?.map((reading, idx) => (
              <button
                key={`${day.id}-${idx}`}
                onClick={() => handleChapterClick(reading)}
                className="w-full flex items-center gap-3 py-2 px-2 hover:bg-stone-50 rounded transition-colors text-left"
              >
                {/* Checkbox */}
                <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-stone-300 flex items-center justify-center" />

                {/* Chapter Text */}
                <span className="flex-1 text-sm text-stone-800">
                  {getFullBookName(reading.book)} {reading.chapter}
                </span>

                {/* Arrow */}
                <ChevronRight 
                  size={18} 
                  className="text-stone-300 flex-shrink-0" 
                />
              </button>
            ))
        }
      </div>

      {/* Start Reading Button */}
      <button
        onClick={handleStartReading}
        className="w-full bg-stone-900 text-white font-semibold py-2 rounded-lg hover:bg-stone-800 active:scale-98 transition-all duration-200 text-sm"
      >
        {day.completed ? 'Перейти к чтению' : 'Начать чтение'}
      </button>
    </div>
  );
};
