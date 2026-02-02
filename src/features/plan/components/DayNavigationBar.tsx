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
  const baseStyles = 'day-navigation-cube flex-shrink-0 w-16 h-16 rounded-lg flex flex-col items-center justify-center relative transition-all duration-200 hover:scale-105 active:scale-95';
  
  const statusStyles = {
    completed: 'bg-green-500 text-white',
    missed: 'bg-red-100 text-red-700',
    future: 'bg-white text-stone-700'
  };

  const selectedStyles = isSelected 
    ? {
        completed: 'border-1 border-green-700 shadow-md',
        missed: 'border-1 border-red-400 shadow-md',
        future: 'border-1 border-stone-800 shadow-md'
      }
    : {
        completed: '',
        missed: 'border border-red-200',
        future: 'border border-stone-200'
      };

  return `${baseStyles} ${statusStyles[status]} ${selectedStyles[status]}`;
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
  const currentYear = new Date().getFullYear();

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
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center px-1 h-8">
        <div className="flex items-center gap-2">
          <span className="text-base sm:text-lg font-bold text-stone-900 uppercase tracking-wider">План чтения {currentYear}</span>
          <button
            onClick={() => router.push('/dashboard/calendar')}
            className="p-2 text-stone-500 hover:text-stone-700 hover:bg-blue-50 border border-stone-200 hover:border-blue-300 rounded-lg transition-all active:scale-95 flex items-center gap-1.5"
            title="Открыть календарь"
          >
            <Calendar size={18} strokeWidth={2.5} />
            <span className="text-xs font-medium">Календарь</span>
          </button>
        </div>
        {selectedDayId !== todayDayNumber && (
          <button
            data-day-navigation-today-button
            onClick={() => onSelectDay(todayDayNumber)}
            className="h-9 p-2 bg-stone-900 text-white border border-white/20 rounded-lg transition-all hover:bg-stone-800 active:scale-95 flex flex-col items-center justify-center leading-none"
            title="Перейти на сегодня"
          >
            <Calendar size={16} strokeWidth={2.5} />
            <span className="text-[9px] font-semibold mt-0.5">Сегодня</span>
          </button>
        )}
      </div>

      <div 
        data-day-navigation-bar="container"
        className="day-navigation-bar w-full overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div 
          ref={scrollContainerRef}
          data-day-navigation-bar="scroll-container"
          className="day-navigation-bar-scroll-container flex gap-2 min-w-max"
        >
          {filteredPlan.map(day => {
            const status = getDayStatus(day);
            const isSelected = selectedDayId === day.id;
            const formattedDate = formatDateShort(day.dateStr);
            const dayOfWeek = getDayOfWeek(day.dateStr);

            return (
              <button
                key={day.id}
                data-day-navigation-cube={`day-${day.id}`}
                data-day-navigation-cube-status={status}
                data-day-navigation-cube-selected={isSelected}
                onClick={() => onSelectDay(day.id)}
                className={getDayCubeStyles(status, isSelected)}
              >
                {/* Галочка для прочитанных дней */}
                {status === 'completed' && (
                  <Check 
                    data-day-navigation-cube-check={`day-${day.id}-check`}
                    size={14} 
                    className="day-navigation-cube-check absolute top-1 right-1 text-white" 
                    strokeWidth={3}
                  />
                )}
                
                {/* День недели */}
                <span className="text-[10px] uppercase font-medium opacity-80 mb-0.5">
                  {dayOfWeek}
                </span>

                {/* Номер дня */}
                <span 
                  data-day-navigation-cube-number={`day-${day.id}-number`}
                  className="day-navigation-cube-number text-base font-black leading-tight"
                >
                  {day.id}
                </span>
                
                {/* Дата */}
                <span 
                  data-day-navigation-cube-date={`day-${day.id}-date`}
                  className="day-navigation-cube-date text-[10px] font-medium opacity-80"
                >
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
