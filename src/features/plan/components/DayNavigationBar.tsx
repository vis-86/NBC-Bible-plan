'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Calendar } from 'lucide-react';
import { ReadingPlanDay } from '@/types';
import { formatDateShort, getDayOfWeek } from '@/shared/utils/bible';

interface DayNavigationBarProps {
  plan: ReadingPlanDay[];
  selectedDayId: number | null;
  todayDayNumber: number;
  onSelectDay: (dayId: number) => void;
}

/**
 * Получает стили для кубика дня навигации
 */
const getDayCubeStyles = (status: 'completed' | 'missed' | 'future', isSelected: boolean): string => {
  const baseStyles = 'day-navigation-cube flex-shrink-0 w-14 h-16 rounded-lg flex flex-col items-center justify-center relative transition-all duration-200 hover:scale-105 active:scale-95';

  const statusStyles = {
    completed: 'bg-app-success text-app-text-inverse',
    missed: 'bg-app-missed text-app-missed-text',
    future: 'text-app-text',
  };

  const selectedRing = isSelected ? 'ring-2 ring-offset-1 ring-offset-app-bg' : '';
  const selectedRingColor = {
    completed: 'ring-app-success',
    missed: 'ring-app-missed-text',
    future: 'ring-app-text-muted',
  };

  return `${baseStyles} ${statusStyles[status]} ${selectedRing} ${isSelected ? selectedRingColor[status] : ''}`;
};

export const DayNavigationBar: React.FC<DayNavigationBarProps> = ({
  plan,
  selectedDayId,
  todayDayNumber,
  onSelectDay
}) => {
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const filteredPlan = useMemo(() => plan.filter(d => d.id > 0), [plan]);

  useEffect(() => {
    if (scrollContainerRef.current && selectedDayId) {
      const selectedElement = scrollContainerRef.current.querySelector(
        `[data-day-navigation-cube="day-${selectedDayId}"]`
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [selectedDayId, filteredPlan.length]);

  const getDayStatus = (day: ReadingPlanDay): 'completed' | 'missed' | 'future' => {
    if (day.completed) {
      return 'completed';
    }
    if (day.id < todayDayNumber) {
      return 'missed';
    }
    return 'future';
  };

  return (
    <div data-day-nav-bar className="flex flex-col gap-2">
      <div data-day-nav-bar-controls className="flex justify-between items-center px-1 h-8">
        <div className="flex items-center gap-2 px-4">
          <button
            data-day-nav-bar-calendar-btn
            onClick={() => router.push('/dashboard/calendar')}
            className="p-2 text-app-text-secondary hover:text-app-text hover:bg-app-primary-light border border-app-border hover:border-app-primary/30 rounded-lg transition-all active:scale-95 flex items-center gap-1.5"
            title="Открыть календарь"
          >
            <Calendar size={18} strokeWidth={2.5} />
            <span className="text-xs font-medium">Календарь</span>
          </button>
        </div>
        {selectedDayId !== todayDayNumber && (
          <button
            data-day-nav-bar-today-btn
            onClick={() => onSelectDay(todayDayNumber)}
            className="h-9 p-2 bg-app-text text-app-text-inverse border border-app-border-subtle rounded-lg transition-all hover:opacity-90 active:scale-95 flex gap-2 items-center justify-center leading-none"
            title="Перейти на сегодня"
          >
            <Calendar size={16} strokeWidth={2.5} />
            <span className="font-semibold">Сегодня</span>
          </button>
        )}
      </div>

      <div
        data-day-nav-bar-track
        className="day-navigation-bar w-full overflow-x-auto pb-2 pt-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          ref={scrollContainerRef}
          data-day-nav-bar-scroll
          className="day-navigation-bar-scroll flex gap-3 min-w-max"
        >
          {filteredPlan.map(day => {
            const status = getDayStatus(day);
            const isSelected = selectedDayId === day.id;
            const formattedDate = formatDateShort(day.dateStr);
            const dayOfWeek = getDayOfWeek(day.dateStr);

            return (
              <button
                key={day.id}
                data-day-nav-cube={day.id}
                data-day-nav-cube-status={status}
                data-day-nav-cube-selected={isSelected || undefined}
                onClick={() => onSelectDay(day.id)}
                className={getDayCubeStyles(status, isSelected)}
              >
                {status === 'completed' && (
                  <Check
                    data-day-nav-cube-check
                    size={14}
                    className="day-navigation-cube-check absolute top-1 right-1 text-white"
                    strokeWidth={3}
                  />
                )}

                <span data-day-nav-cube-weekday className="text-[10px] uppercase font-medium opacity-80 mb-0.5">
                  {dayOfWeek}
                </span>

                <span data-day-nav-cube-number className="day-navigation-cube-number text-base font-black leading-tight">
                  {day.id}
                </span>

                <span data-day-nav-cube-date className="day-navigation-cube-date text-[10px] font-medium opacity-80">
                  {formattedDate}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
