'use client';

import React, { useMemo, useEffect, useRef, useState } from 'react';
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
  const trackRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const filteredPlan = useMemo(() => plan.filter(d => d.id > 0), [plan]);
  const [isTodayCubeVisible, setIsTodayCubeVisible] = useState(true);
  // Куда уехал куб "сегодня" когда он не виден: 'right' = сегодня правее видимой зоны
  const [todayCubeOffscreen, setTodayCubeOffscreen] = useState<'left' | 'right'>('right');

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

  useEffect(() => {
    // root должен быть клипающий overflow-x-auto контейнер (track),
    // а не внутренний min-w-max flex — тот никогда не скрывает содержимое
    const track = trackRef.current;
    const inner = scrollContainerRef.current;
    if (!track || !inner) return;

    const todayEl = inner.querySelector<HTMLElement>(
      `[data-day-nav-cube="${todayDayNumber}"]`
    );
    if (!todayEl) return;

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        setIsTodayCubeVisible(entry.isIntersecting);
        if (!entry.isIntersecting && entry.rootBounds) {
          // Куб левее левого края трека — он "уехал влево", сегодня слева
          // Куб правее правого края — он "уехал вправо", сегодня справа
          const dir = entry.boundingClientRect.left < entry.rootBounds.left ? 'left' : 'right';
          setTodayCubeOffscreen(dir);
        }
      },
      { root: track, threshold: 0.8 }
    );
    observerRef.current.observe(todayEl);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [todayDayNumber, filteredPlan.length]);

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
        ref={trackRef}
        data-day-nav-bar-track
        className="day-navigation-bar w-full overflow-x-auto pb-2 pt-8 pb-8 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
          not clipped; positioned absolute relative to data-day-nav-bar.
          Логика стороны:
          - today правее вьюпорта (прошлое выбрано или куб уехал вправо) → кнопка СЛЕВА, шеврон →
          - today левее вьюпорта (будущее выбрано или куб уехал влево) → кнопка СПРАВА, шеврон ← */}
      {(!isTodayCubeVisible || selectedDayId !== todayDayNumber) && (() => {
        const todayIsRight =
          (selectedDayId !== null && selectedDayId < todayDayNumber) ||
          (selectedDayId === todayDayNumber && todayCubeOffscreen === 'right');

        return (
          <div
            className={cn(
              'absolute inset-y-0 flex items-center pointer-events-none z-10',
              todayIsRight
                ? 'left-0 bg-gradient-to-r from-app-bg via-app-bg/80 to-transparent w-28 pl-0'
                : 'right-0 bg-gradient-to-l from-app-bg via-app-bg/80 to-transparent w-28 pr-0'
            )}
          >
            <button
              data-day-nav-bar-today-btn
              onClick={() => {
                onSelectDay(todayDayNumber);
                // Прямой скролл нужен когда selectedDayId уже равен todayDayNumber —
                // в этом случае deps useEffect не меняются и scrollIntoView не вызывается
                scrollContainerRef.current
                  ?.querySelector<HTMLElement>(`[data-day-nav-cube="${todayDayNumber}"]`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }}
              aria-label="Перейти на сегодня"
              className={cn(
                'pointer-events-auto group flex items-center gap-1 h-8 rounded-full',
                'bg-app-primary text-app-text-inverse',
                'text-xs font-bold tracking-wide',
                'shadow-app-sm transition-all duration-200',
                'hover:scale-105 hover:shadow-app-md active:scale-95',
                todayIsRight ? 'ml-1 pl-3 pr-2.5' : 'mr-1 pl-2.5 pr-3'
              )}
            >
              {todayIsRight ? (
                <>
                  <span>Сегодня</span>
                  <ChevronRight
                    size={13}
                    strokeWidth={3}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </>
              ) : (
                <>
                  <ChevronLeft
                    size={13}
                    strokeWidth={3}
                    className="transition-transform duration-200 group-hover:-translate-x-0.5"
                  />
                  <span>Сегодня</span>
                </>
              )}
            </button>
          </div>
        );
      })()}
    </div>
  );
};
