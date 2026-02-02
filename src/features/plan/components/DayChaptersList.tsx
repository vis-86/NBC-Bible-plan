'use client';

import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { ReadingPlanDay, BibleReference } from '@/types';
import { parseReadingItem, getFullBookName } from '@/shared/utils/bible';
import { ChapterRow } from './ChapterRow';

interface DayChaptersListProps {
  day: ReadingPlanDay;
  todayDayNumber: number;
  totalDays: number;
  onToggleItem: (dayId: number, itemNumber: number) => void;
  onToggleComplete: (dayId: number) => void;
  onSelectReading: (day: ReadingPlanDay, reading: BibleReference) => void;
  onStartReading: () => void;
  onNavigateToNextDay?: () => void;
}

export const DayChaptersList: React.FC<DayChaptersListProps> = ({
  day,
  todayDayNumber,
  totalDays,
  onToggleItem,
  onToggleComplete,
  onSelectReading,
  onStartReading,
  onNavigateToNextDay
}) => {
  const handleChapterClick = (reading: BibleReference | null) => {
    if (reading) {
      onSelectReading(day, reading);
    }
  };

  const handleToggle = (e: React.MouseEvent, itemNumber: number) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleItem(day.id, itemNumber);
  };

  const handleToggleComplete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleComplete(day.id);
  };

  // Находим первую непрочитанную главу для кнопки "Начать чтение"
  const firstUnreadItem = day.items?.find(item => !item.completed);
  const firstUnreadReading = firstUnreadItem ? parseReadingItem(firstUnreadItem.readText) : null;

  const handleStartReading = () => {
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
    <div 
      data-day-chapters-list={`day-${day.id}`}
      className="day-chapters-list flex flex-col h-full"
    >
      {/* Заголовок дня */}
      <div 
        data-day-chapters-list-header={`day-${day.id}-header`}
        className="day-chapters-list-header px-4 py-3 bg-transparent border-b border-black/5"
      >
        <div 
          data-day-chapters-list-header-top={`day-${day.id}-header-top`}
          className="day-chapters-list-header-top flex items-center justify-between"
        >
          <h2 
            data-day-chapters-list-title={`day-${day.id}-title`}
            className="day-chapters-list-title text-xl font-bold text-stone-900"
          >
            День {day.id} из {totalDays}
          </h2>
          <button
            onClick={handleToggleComplete}
            className={`text-sm font-semibold px-3 py-1 rounded-full transition-colors flex items-center gap-2 ${
              day.completed 
                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                : 'bg-black/5 text-stone-700 hover:bg-black/10'
            }`}
          >
            <Check 
              size={16} 
              className={day.completed ? 'text-green-700' : 'text-stone-600'}
              strokeWidth={3}
            />
            {day.completed ? 'Прочитано' : 'Отметить всё'}
          </button>
        </div>
      </div>

      {/* Список глав */}
      <div 
        data-day-chapters-list-items={`day-${day.id}-items`}
        className="day-chapters-list-items flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {day.items && day.items.length > 0 
          ? day.items.map(item => {
              const reading = parseReadingItem(item.readText);
              const isRead = item.completed;

              return (
                <ChapterRow
                  key={item.id}
                  data-testid={`day-${day.id}-item-${item.item}`}
                  text={reading ? `${reading.book} ${reading.chapter}` : item.readText}
                  onClick={() => handleChapterClick(reading)}
                  textClassName={isRead ? 'text-stone-400 line-through' : 'text-stone-800'}
                  left={
                    <button
                      type="button"
                      data-day-chapters-list-item-checkbox={`day-${day.id}-item-${item.item}-checkbox`}
                      onClick={(e) => handleToggle(e, item.item)}
                      aria-pressed={isRead}
                      aria-label={isRead ? 'Снять отметку' : 'Отметить как прочитано'}
                      className="day-chapters-list-item-checkbox flex-shrink-0 w-10 h-10 -m-2 rounded-full flex items-center justify-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
                    >
                      <span
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isRead
                            ? 'bg-green-500 border-green-500'
                            : 'bg-transparent border-stone-300 hover:border-stone-400'
                        }`}
                      >
                        {isRead && (
                          <Check
                            data-day-chapters-list-item-check={`day-${day.id}-item-${item.item}-check`}
                            size={16}
                            className="day-chapters-list-item-check text-white"
                            strokeWidth={3}
                          />
                        )}
                      </span>
                    </button>
                  }
                />
              );
            })
          : day.readings?.map((reading, idx) => (
              <ChapterRow
                key={`${day.id}-${idx}`}
                data-testid={`day-${day.id}-reading-${idx}`}
                text={`${getFullBookName(reading.book)} ${reading.chapter}`}
                onClick={() => handleChapterClick(reading)}
                left={
                  <div
                    data-day-chapters-list-item-checkbox={`day-${day.id}-reading-${idx}-checkbox`}
                    className="day-chapters-list-item-checkbox flex-shrink-0 w-6 h-6 rounded-full border-2 border-stone-300 flex items-center justify-center"
                  />
                }
              />
            ))
        }
      </div>

      {/* Кнопка действия */}
      <div 
        data-day-chapters-list-footer={`day-${day.id}-footer`}
        className="day-chapters-list-footer px-4 py-4 bg-transparent border-t border-black/5"
      >
        {day.completed ? (
          // Если день завершен - показываем кнопку перехода к следующему дню
          onNavigateToNextDay ? (
            <button
              data-day-chapters-list-next-button={`day-${day.id}-next-button`}
              onClick={onNavigateToNextDay}
              className="day-chapters-list-next-button w-full bg-white/60 border border-black/10 text-stone-900 font-bold py-4 rounded-2xl hover:bg-white/80 active:scale-98 transition-all duration-200"
            >
              Перейти к следующему дню →
            </button>
          ) : (
            // Если это последний день - показываем сообщение о завершении
            <div className="w-full bg-green-100/80 text-green-800 font-bold py-4 rounded-2xl text-center ring-1 ring-black/5">
              План завершен!
            </div>
          )
        ) : (
          // Если день не завершен - показываем кнопку начала/продолжения чтения
          <button
            data-day-chapters-list-start-button={`day-${day.id}-start-button`}
            onClick={handleStartReading}
            className="day-chapters-list-start-button w-full bg-stone-900/95 text-white font-bold py-4 rounded-2xl hover:bg-stone-900 active:scale-98 transition-all duration-200"
          >
            {day.readCount && day.readCount > 0 ? 'Продолжить чтение' : 'Начать чтение'}
          </button>
        )}
      </div>
    </div>
  );
};
