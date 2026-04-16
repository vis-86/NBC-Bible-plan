'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { ReadingPlanDay } from '@/types';
import { formatDateShort, getDayOfWeek } from '@/shared/utils/bible';
import { cn } from '@/shared/utils/cn';

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const filteredPlan = useMemo(() => plan.filter(d => d.id > 0), [plan]);

  useEffect(() => {
    if (scrollContainerRef.current && selectedDayId) {
      const selectedElement = scrollContainerRef.current.querySelector(
        `[data-day-nav-cube="${selectedDayId}"]`
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
    <div data-day-nav-bar className="relative flex flex-col gap-2">
      {/* Scrollable track — overflow-x-auto clips absolute children, so the
          floating "Сегодня" button lives in the outer relative wrapper instead */}
      <div
        data-day-nav-bar-track
        className="day-navigation-bar w-full overflow-x-auto pb-2 pt-4 pb-8 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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

      {/* Floating "Сегодня" button — outside the overflow container so it's
          not clipped; positioned absolute relative to data-day-nav-bar */}
      {selectedDayId !== todayDayNumber && (
        <div
          className={cn(
            'absolute inset-y-0 flex items-center pointer-events-none z-10',
            selectedDayId !== null && selectedDayId < todayDayNumber
              ? 'left-0 bg-gradient-to-r from-app-bg to-transparent pr-3 pl-1'
              : 'right-0 bg-gradient-to-l from-app-bg to-transparent pl-3 pr-1'
          )}
        >
          <button
            data-day-nav-bar-today-btn
            onClick={() => onSelectDay(todayDayNumber)}
            className="pointer-events-auto h-9 px-3 bg-app-text text-app-text-inverse rounded-lg transition-all hover:opacity-90 active:scale-95 flex gap-1.5 items-center text-sm font-semibold shadow-app-md"
            title="Перейти на сегодня"
          >
            {selectedDayId !== null && selectedDayId < todayDayNumber ? (
              <>
                <span>Сегодня</span>
                <ChevronRight size={16} strokeWidth={2.5} />
              </>
            ) : (
              <>
                <ChevronLeft size={16} strokeWidth={2.5} />
                <span>Сегодня</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
