'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ArrowLeft, Check, Info, X } from 'lucide-react';
import { ReadingPlanDay, BibleReference } from '@/types';
import { Modal } from '@/shared/components/ui/Modal';
import { Toast } from '@/shared/components/ui/Toast';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { CalendarDayDetail } from './CalendarDayDetail';

interface CalendarViewProps {
  plan: ReadingPlanDay[];
  onSelectReading: (day: ReadingPlanDay, reading: BibleReference) => void;
  onToggleComplete: (dayId: number) => Promise<void>;
  onToggleItem: (dayId: number, itemNumber: number) => Promise<void>;
  onBack: () => void;
}


interface CalendarMonth {
  year: number;
  month: number; // 0-11
  days: CalendarDay[];
}

interface CalendarDay {
  dayNumber: number; // день месяца (1-31)
  dayId: number | null; // ID дня плана или null если день не в плане
  isCompleted: boolean;
  isToday: boolean;
  isSelected: boolean; // день отмечен галочкой
  isOtherMonth: boolean; // день из другого месяца
  isMissed: boolean; // день пропущен (прошедший и не прочитанный)
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  plan,
  onSelectReading,
  onToggleComplete,
  onToggleItem,
  onBack
}) => {
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  const lastActionDaysRef = useRef<number[] | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const filteredPlan = useMemo(() => plan.filter(d => d.id > 0), [plan]);

  // Получаем день года (1-365/366)
  const getDayOfYear = (date: Date): number => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const todayDayNumber = useMemo(() => {
    if (filteredPlan.length === 0) return 1;
    const now = new Date();
    const dayOfYear = getDayOfYear(now);
    const maxDayNumber = Math.max(...filteredPlan.map(d => d.id));
    return dayOfYear > maxDayNumber ? maxDayNumber : dayOfYear;
  }, [filteredPlan]);

  // Создаем карту дней плана для быстрого доступа
  const planMap = useMemo(() => {
    const map = new Map<number, ReadingPlanDay>();
    filteredPlan.forEach(day => {
      map.set(day.id, day);
    });
    return map;
  }, [filteredPlan]);

  // Группируем дни по месяцам
  const months = useMemo(() => {
    if (filteredPlan.length === 0) return [];

    const monthsMap = new Map<string, CalendarMonth>();
    const currentYear = new Date().getFullYear();
    const today = new Date();
    const todayDayOfYear = getDayOfYear(today);

    // Создаем дни для всех месяцев года
    for (let month = 0; month < 12; month++) {
      const firstDay = new Date(currentYear, month, 1);
      const lastDay = new Date(currentYear, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      // Преобразуем: 0 (воскресенье) -> 6, 1-6 (понедельник-суббота) -> 0-5
      const firstDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

      const monthKey = `${currentYear}-${month}`;
      const calendarDays: CalendarDay[] = [];

      // Добавляем дни предыдущего месяца
      const prevMonthLastDay = new Date(currentYear, month, 0).getDate();
      for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const dayNumber = prevMonthLastDay - i;
        calendarDays.push({
          dayNumber,
          dayId: null,
          isCompleted: false,
          isToday: false,
          isSelected: false,
          isOtherMonth: true,
          isMissed: false
        });
      }

      // Добавляем дни текущего месяца
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, month, day);
        const dayOfYear = getDayOfYear(date);
        const maxDayNumber = Math.max(...filteredPlan.map(d => d.id));
        
        // День плана соответствует дню года, но если день года больше максимального дня плана, то это не день плана
        const planDayId = dayOfYear <= maxDayNumber ? dayOfYear : null;
        const planDay = planDayId ? planMap.get(planDayId) : null;
        const isToday = dayOfYear === todayDayOfYear && 
                       date.getFullYear() === today.getFullYear() &&
                       date.getMonth() === today.getMonth() &&
                       date.getDate() === today.getDate();

        const isMissed = planDayId !== null && planDayId < todayDayNumber && !planDay?.completed;
        
        calendarDays.push({
          dayNumber: day,
          dayId: planDayId,
          isCompleted: planDay?.completed || false,
          isToday,
          isSelected: planDayId !== null && selectedDays.has(planDayId),
          isOtherMonth: false,
          isMissed
        });
      }

      // Добавляем дни следующего месяца до заполнения сетки (6 недель * 7 дней = 42 дня)
      const totalDays = calendarDays.length;
      const remainingDays = 42 - totalDays;
      for (let day = 1; day <= remainingDays; day++) {
        calendarDays.push({
          dayNumber: day,
          dayId: null,
          isCompleted: false,
          isToday: false,
          isSelected: false,
          isOtherMonth: true,
          isMissed: false
        });
      }

      monthsMap.set(monthKey, {
        year: currentYear,
        month,
        days: calendarDays
      });
    }

    return Array.from(monthsMap.values());
  }, [filteredPlan, planMap, selectedDays, todayDayNumber]);

  // При открытии календаря прокручиваем к месяцу с текущим днём
  useEffect(() => {
    if (months.length === 0) return;
    const todayMonthEl = scrollContainerRef.current?.querySelector('[data-today-month="true"]');
    if (todayMonthEl) {
      todayMonthEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [months.length]);

  const selectedDay = selectedDayId ? planMap.get(selectedDayId) : null;

  const monthNames = [
    'ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ',
    'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'
  ];

  const weekDays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

  const handleDayClick = (day: CalendarDay) => {
    if (day.dayId === null) return;

    setSelectedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(day.dayId!)) {
        newSet.delete(day.dayId!);
      } else {
        newSet.add(day.dayId!);
      }
      
      // Показываем контекстное меню если есть отмеченные дни
      if (newSet.size > 0) {
        setShowContextMenu(true);
      } else {
        setShowContextMenu(false);
      }
      
      return newSet;
    });
  };

  const handleDayDoubleClick = (day: CalendarDay) => {
    if (day.dayId === null) return;
    setSelectedDayId(day.dayId);
  };

  const selectedDaysArray = useMemo(() => {
    return Array.from(selectedDays).sort((a, b) => a - b);
  }, [selectedDays]);

  const selectedDaysInfo = useMemo(() => {
    if (selectedDaysArray.length === 0) return null;

    const days = selectedDaysArray.map(id => planMap.get(id)).filter(Boolean) as ReadingPlanDay[];
    const allCompleted = days.every(day => day.completed);
    const allUncompleted = days.every(day => !day.completed);
    const completedCount = days.filter(day => day.completed).length;
    const uncompletedCount = days.filter(day => !day.completed).length;
    const count = days.length;

    return {
      days,
      allCompleted,
      allUncompleted,
      completedCount,
      uncompletedCount,
      count
    };
  }, [selectedDaysArray, planMap]);

  const handleMarkSelected = async () => {
    if (!selectedDaysInfo) return;

    // Сохраняем информацию о последнем действии для возможности отмены
    lastActionDaysRef.current = [...selectedDaysArray];

    // Отмечаем только неотмеченные дни как прочитанные
    const daysToMark = selectedDaysArray.filter(dayId => {
      const day = planMap.get(dayId);
      return day && !day.completed;
    });

    for (const dayId of daysToMark) {
      try {
        await onToggleComplete(dayId);
      } catch (error) {
        console.error(`Error marking day ${dayId} as complete:`, error);
      }
    }

    const count = daysToMark.length;
    setToastMessage(
      `Отмечено ${count} ${count === 1 ? 'день' : count < 5 ? 'дня' : 'дней'} как прочитанные`
    );

    setShowToast(true);
    setSelectedDays(new Set());
    setShowContextMenu(false);
  };

  const handleUnmarkSelected = async () => {
    if (!selectedDaysInfo) return;

    // Сохраняем информацию о последнем действии для возможности отмены
    lastActionDaysRef.current = [...selectedDaysArray];

    // Снимаем отметку только с отмеченных дней
    const daysToUnmark = selectedDaysArray.filter(dayId => {
      const day = planMap.get(dayId);
      return day && day.completed;
    });

    for (const dayId of daysToUnmark) {
      try {
        await onToggleComplete(dayId);
      } catch (error) {
        console.error(`Error unmarking day ${dayId}:`, error);
      }
    }

    const count = daysToUnmark.length;
    setToastMessage(
      `Снята отметка с ${count} ${count === 1 ? 'дня' : count < 5 ? 'дней' : 'дней'}`
    );

    setShowToast(true);
    setSelectedDays(new Set());
    setShowContextMenu(false);
  };

  const handleUndo = useCallback(async () => {
    if (!lastActionDaysRef.current) return;

    const daysToRevert = lastActionDaysRef.current;

    // Отменяем последнее действие
    for (const dayId of daysToRevert) {
      const day = planMap.get(dayId);
      if (day) {
        try {
          await onToggleComplete(dayId);
        } catch (error) {
          console.error(`Error reverting day ${dayId}:`, error);
        }
      }
    }

    lastActionDaysRef.current = null;
    setShowToast(false);
  }, [planMap, onToggleComplete]);

  const handleToastClose = useCallback(() => {
    setShowToast(false);
    lastActionDaysRef.current = null;
  }, []);

  const handleClearSelection = () => {
    setSelectedDays(new Set());
    setShowContextMenu(false);
  };

  // Вычисляем пропущенные дни (прошедшие дни, которые не отмечены как прочитанные)
  const missedDays = useMemo(() => {
    return filteredPlan.filter(day => {
      return day.id < todayDayNumber && !day.completed;
    });
  }, [filteredPlan, todayDayNumber]);

  const handleMarkAllMissed = async () => {
    if (missedDays.length === 0) return;

    // Сохраняем информацию о последнем действии для возможности отмены
    lastActionDaysRef.current = missedDays.map(day => day.id);

    // Отмечаем все пропущенные дни как прочитанные
    for (const day of missedDays) {
      try {
        await onToggleComplete(day.id);
      } catch (error) {
        console.error(`Error marking day ${day.id} as complete:`, error);
      }
    }

    const count = missedDays.length;
    setToastMessage(
      `Отмечено ${count} ${count === 1 ? 'пропущенный день' : count < 5 ? 'пропущенных дня' : 'пропущенных дней'} как прочитанные`
    );

    setShowToast(true);
  };

  const currentMonthIndex = new Date().getMonth();

  return (
    <div
      ref={scrollContainerRef}
      className="flex flex-col h-full bg-stone-100 text-stone-900 overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-4 shadow-sm">
        <button
          onClick={onBack}
          className="p-2 hover:bg-stone-100 rounded-lg transition-colors active:scale-95 text-stone-600"
          aria-label="Назад"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-stone-900">Календарь</h1>
        {missedDays.length === 0 && (
          <div className="flex items-center gap-1.5 text-sm font-medium text-green-600 ml-auto">
            <Check size={16} strokeWidth={2.5} />
            <span>Все по плану</span>
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="flex-1 p-4 space-y-6 relative z-0">
        {/* Hint */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
          <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed">
            Кликните на день, чтобы выбрать его. Появится меню для дальнейших действий.
          </p>
        </div>

        {months.map((month) => (
          <div
            key={`${month.year}-${month.month}`}
            className={`space-y-3 ${month.month === currentMonthIndex ? 'scroll-mt-20' : ''}`}
            {...(month.month === currentMonthIndex ? { 'data-today-month': 'true' } : {})}
          >
            {/* Month Header */}
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">
              {monthNames[month.month]} {month.year} Г.
            </h2>

            {/* Week Days Header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-stone-400 py-1"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {month.days.map((day, index) => (
                <button
                  key={`${month.year}-${month.month}-${index}`}
                  onClick={() => handleDayClick(day)}
                  disabled={day.dayId === null}
                  onDoubleClick={() => handleDayDoubleClick(day)}
                  className={`
                    aspect-square flex items-center justify-center relative
                    transition-all duration-200 rounded-lg
                    ${day.isOtherMonth ? 'text-stone-300' : day.isMissed ? 'text-red-700' : 'text-stone-900'}
                    ${day.isSelected 
                      ? 'border-2 border-blue-600 bg-blue-50' 
                      : day.isMissed
                        ? 'border border-red-200 bg-red-100 hover:bg-red-50'
                        : day.isOtherMonth 
                          ? 'border-0 bg-transparent' 
                          : 'border border-stone-200 bg-white hover:bg-stone-50'
                    }
                    ${day.isToday && !day.isSelected && !day.isMissed ? 'border-stone-400 bg-stone-50' : ''}
                    ${day.dayId !== null ? 'cursor-pointer' : 'cursor-default'}
                    ${day.isOtherMonth ? '' : 'active:scale-95'}
                  `}
                >
                  {/* Checkmark for selected days - centered */}
                  {day.isSelected && !day.isOtherMonth && (
                    <Check
                      size={16}
                      className="absolute inset-0 m-auto text-blue-600"
                      strokeWidth={3}
                    />
                  )}

                  {/* Checkmark for completed days */}
                  {day.isCompleted && !day.isSelected && !day.isOtherMonth && (
                    <Check
                      size={10}
                      className="absolute top-1 right-1 text-green-600"
                      strokeWidth={3}
                    />
                  )}

                  {/* Day Number */}
                  {!day.isSelected && (
                    <span className={`text-sm ${day.isSelected ? 'font-bold' : 'font-normal'}`}>
                      {day.dayNumber}
                    </span>
                  )}
                  {day.isSelected && !day.isOtherMonth && (
                    <span className="absolute bottom-1 right-1 text-xs text-blue-600 font-medium">
                      {day.dayNumber}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Context Menu BottomSheet */}
      <BottomSheet
        isOpen={showContextMenu && selectedDaysInfo !== null}
        onClose={handleClearSelection}
        title="Действия с выбранными днями"
        maxHeight="max-h-[60vh]"
        disableOverlay={true}
      >
        {selectedDaysInfo && (
          <div className="space-y-4">
            <p className="text-stone-600 text-sm">
              Выбрано дней: <span className="font-semibold text-stone-900">
                {selectedDaysInfo.count}
              </span>
            </p>

            {/* List of selected days */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {selectedDaysInfo.days.map(day => (
                <div
                  key={day.id}
                  className="flex items-center justify-between p-2 bg-stone-50 rounded-lg"
                >
                  <span className="text-sm font-medium text-stone-900">
                    День {day.id}
                  </span>
                  {day.completed && (
                    <span className="text-xs text-green-600 font-medium">
                      Прочитано
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleClearSelection}
                className="flex-1 px-3 py-2 bg-stone-100 text-stone-700 text-sm font-semibold rounded-lg hover:bg-stone-200 transition-colors"
              >
                Отмена
              </button>
              {selectedDaysInfo.uncompletedCount > 0 && (
                <button
                  onClick={handleMarkSelected}
                  className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check size={16} strokeWidth={3} />
                  <span>Отметить</span>
                </button>
              )}
              {selectedDaysInfo.completedCount > 0 && (
                <button
                  onClick={handleUnmarkSelected}
                  className="flex-1 px-3 py-2 bg-stone-600 text-white text-sm font-semibold rounded-lg hover:bg-stone-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <X size={16} strokeWidth={3} />
                  <span>Отменить</span>
                </button>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Bottom Sheet for Day Details */}
      {selectedDay && (
        <BottomSheet
          isOpen={selectedDayId !== null}
          onClose={() => setSelectedDayId(null)}
          title={
            <div className="flex items-center justify-between w-full pr-8">
              <span className="text-xl font-bold text-stone-900">День {selectedDay.id}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleComplete(selectedDay.id);
                }}
                className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                  selectedDay.completed 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {selectedDay.completed ? 'Прочитано' : 'Отметить всё'}
              </button>
            </div>
          }
          maxHeight="max-h-[70vh]"
        >
          <CalendarDayDetail
            day={selectedDay}
            onToggleComplete={onToggleComplete}
            onToggleItem={onToggleItem}
            onSelectReading={onSelectReading}
            onClose={() => setSelectedDayId(null)}
          />
        </BottomSheet>
      )}

      {/* Floating Button for Missed Days */}
      {missedDays.length > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[50]">
          <button
            onClick={handleMarkAllMissed}
            className="px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 shadow-lg active:scale-95"
          >
            <Check size={18} strokeWidth={3} />
            <span>Отметить пропущенные</span>
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {missedDays.length}
            </span>
          </button>
        </div>
      )}

      {/* Toast Notification */}
      <Toast
        isOpen={showToast}
        onClose={handleToastClose}
        onUndo={handleUndo}
        message={toastMessage}
        duration={3}
      />
    </div>
  );
};
