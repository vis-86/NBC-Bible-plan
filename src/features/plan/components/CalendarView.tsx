'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Check, Info, X } from 'lucide-react';
import { ReadingPlanDay, BibleReference } from '@/types';
import { Modal } from '@/shared/components/ui/Modal';
import { Toast } from '@/shared/components/ui/Toast';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { CalendarDayDetail } from './CalendarDayDetail';

interface CalendarViewProps {
  plan: ReadingPlanDay[];
  onSelectReading: (day: ReadingPlanDay, reading: BibleReference) => void;
  onToggleComplete: (dayId: number) => Promise<void>;
  onToggleItem: (dayId: number, itemNumber: number) => Promise<void>;
  onToggleCompleteMany: (dayIds: number[], completed: boolean) => Promise<void>;
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
  status: 'completed' | 'missed' | 'future' | null;
  isToday: boolean;
  isSelected: boolean; // день отмечен галочкой
  isOtherMonth: boolean; // день из другого месяца
}

const getCalendarDayStatus = (
  dayId: number | null,
  completed: boolean,
  todayDayNumber: number
): 'completed' | 'missed' | 'future' | null => {
  if (dayId === null) return null;
  if (completed) return 'completed';
  if (dayId < todayDayNumber) return 'missed';
  return 'future';
};

const getCalendarDayCubeClasses = (day: CalendarDay): string => {
  if (day.isOtherMonth) {
    return 'aspect-square flex items-center justify-center relative transition-all duration-200 rounded-lg text-app-text-subtle border-0 bg-transparent cursor-default';
  }

  const statusTextClasses =
    day.status === 'completed'
      ? 'text-app-text-inverse'
      : day.status === 'missed'
        ? 'text-app-missed-text'
        : 'text-app-text';

  const statusBgClasses =
    day.status === 'completed'
      ? 'bg-app-success border border-app-success'
      : day.status === 'missed'
        ? 'bg-app-missed border border-app-missed-text/30'
        : 'bg-app-surface border border-app-border';

  const todayClasses =
    day.isToday && !day.isSelected && day.status !== 'completed'
      ? 'border-app-border-strong bg-app-surface-muted'
      : '';

  const selectedClasses = day.isSelected ? 'ring-2 ring-app-primary ring-offset-1 ring-offset-app-bg' : '';

  return [
    'aspect-square flex items-center justify-center relative transition-all duration-200 rounded-lg cursor-pointer active:scale-95',
    statusTextClasses,
    statusBgClasses,
    todayClasses,
    selectedClasses,
  ]
    .filter(Boolean)
    .join(' ');
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  plan,
  onSelectReading,
  onToggleComplete,
  onToggleItem,
  onToggleCompleteMany,
  onBack
}) => {
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  // Tracks the last bulk action so it can be undone. Stores ONLY the days that
  // actually changed plus the direction applied — undo re-applies the inverse
  // to exactly those days (never the untouched ones that were merely selected).
  const lastActionRef = useRef<{ days: number[]; completed: boolean } | null>(null);
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
          status: null,
          isToday: false,
          isSelected: false,
          isOtherMonth: true,
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

        const completed = planDay?.completed || false;
        const status = getCalendarDayStatus(planDayId, completed, todayDayNumber);

        calendarDays.push({
          dayNumber: day,
          dayId: planDayId,
          status,
          isToday,
          isSelected: planDayId !== null && selectedDays.has(planDayId),
          isOtherMonth: false
        });
      }

      // Добавляем дни следующего месяца до заполнения сетки (6 недель * 7 дней = 42 дня)
      const totalDays = calendarDays.length;
      const remainingDays = 42 - totalDays;
      for (let day = 1; day <= remainingDays; day++) {
        calendarDays.push({
          dayNumber: day,
          dayId: null,
          status: null,
          isToday: false,
          isSelected: false,
          isOtherMonth: true,
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

    // Отмечаем только неотмеченные дни как прочитанные
    const daysToMark = selectedDaysArray.filter(dayId => {
      const day = planMap.get(dayId);
      return day && !day.completed;
    });
    if (daysToMark.length === 0) return;

    // Сохраняем ТОЛЬКО реально изменённые дни для отмены
    lastActionRef.current = { days: daysToMark, completed: true };
    console.debug('[CalendarView] bulk action executed', {
      action: 'mark_selected_complete',
      days: daysToMark,
      completed: true
    });

    await onToggleCompleteMany(daysToMark, true);

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

    // Снимаем отметку только с отмеченных дней
    const daysToUnmark = selectedDaysArray.filter(dayId => {
      const day = planMap.get(dayId);
      return day && day.completed;
    });
    if (daysToUnmark.length === 0) return;

    // Сохраняем ТОЛЬКО реально изменённые дни для отмены
    lastActionRef.current = { days: daysToUnmark, completed: false };
    console.debug('[CalendarView] bulk action executed', {
      action: 'unmark_selected_complete',
      days: daysToUnmark,
      completed: false
    });

    await onToggleCompleteMany(daysToUnmark, false);

    const count = daysToUnmark.length;
    setToastMessage(
      `Снята отметка с ${count} ${count === 1 ? 'дня' : count < 5 ? 'дней' : 'дней'}`
    );

    setShowToast(true);
    setSelectedDays(new Set());
    setShowContextMenu(false);
  };

  const handleUndo = useCallback(async () => {
    const lastAction = lastActionRef.current;
    if (!lastAction) return;

    console.debug('[CalendarView] bulk action executed', {
      action: 'undo_last_bulk_action',
      days: lastAction.days,
      completed: !lastAction.completed
    });

    // Отменяем последнее действие — инверсия направления только для изменённых дней
    await onToggleCompleteMany(lastAction.days, !lastAction.completed);

    lastActionRef.current = null;
    setShowToast(false);
  }, [onToggleCompleteMany]);

  const handleToastClose = useCallback(() => {
    setShowToast(false);
    lastActionRef.current = null;
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

    const missedDayIds = missedDays.map(day => day.id);

    // Сохраняем ТОЛЬКО реально изменённые дни для отмены
    lastActionRef.current = { days: missedDayIds, completed: true };

    // Отмечаем все пропущенные дни как прочитанные — одним запросом
    console.debug('[CalendarView] bulk action executed', {
      action: 'mark_all_missed_complete',
      days: missedDayIds,
      completed: true
    });

    await onToggleCompleteMany(missedDayIds, true);

    const count = missedDayIds.length;
    setToastMessage(
      `Отмечено ${count} ${count === 1 ? 'пропущенный день' : count < 5 ? 'пропущенных дня' : 'пропущенных дней'} как прочитанные`
    );

    setShowToast(true);
  };

  const currentMonthIndex = new Date().getMonth();

  return (
    <div
      ref={scrollContainerRef}
      className="flex flex-col h-full bg-app-bg text-app-text overflow-y-auto"
    >
      {/* Header */}
      <PageHeader
        title="Календарь"
        onBack={onBack}
        right={
          missedDays.length === 0 ? (
            <div className="flex items-center gap-1.5 text-sm font-medium text-app-success">
              <Check size={16} strokeWidth={2.5} />
              <span>Все по плану</span>
            </div>
          ) : undefined
        }
      />

      {/* Calendar */}
      <div className="flex-1 p-4 space-y-6 relative z-0">
        {/* Hint */}
        <div className="flex items-start gap-2 bg-app-surface-muted border border-app-border rounded-lg p-3">
          <Info size={16} className="text-app-text-secondary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-app-text-secondary leading-relaxed">
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
            <h2 className="text-sm font-bold uppercase tracking-wider text-app-text-muted">
              {monthNames[month.month]} {month.year} Г.
            </h2>

            {/* Week Days Header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-app-text-subtle py-1"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {month.days.map((day, index) => (
                (() => {
                  const dayClassName = getCalendarDayCubeClasses(day);

                  return (
                    <button
                      key={`${month.year}-${month.month}-${index}`}
                      onClick={() => handleDayClick(day)}
                      disabled={day.dayId === null}
                      onDoubleClick={() => handleDayDoubleClick(day)}
                      data-day-nav-cube={day.dayId ?? undefined}
                      data-day-nav-cube-status={day.status ?? undefined}
                      data-day-nav-cube-selected={day.isSelected || undefined}
                      className={dayClassName}
                    >
                  {/* Checkmark for selected days - centered */}
                  {day.isSelected && !day.isOtherMonth && (
                    <Check
                      size={16}
                      className="absolute inset-0 m-auto text-app-primary"
                      strokeWidth={3}
                    />
                  )}

                  {/* Checkmark for completed days */}
                  {day.status === 'completed' && !day.isSelected && !day.isOtherMonth && (
                    <Check
                      size={12}
                      className="absolute top-1 right-1 text-white"
                      strokeWidth={3}
                    />
                  )}

                  {/* Day Number */}
                  {!day.isSelected && (
                    <span className="text-sm font-normal">
                      {day.dayNumber}
                    </span>
                  )}
                  {day.isSelected && !day.isOtherMonth && (
                    <span className="absolute bottom-1 right-1 text-xs text-app-primary font-medium">
                      {day.dayNumber}
                    </span>
                  )}
                    </button>
                  );
                })()
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
            <p className="text-app-text-secondary text-sm">
              Выбрано дней: <span className="font-semibold text-app-text">
                {selectedDaysInfo.count}
              </span>
            </p>

            {/* List of selected days */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {selectedDaysInfo.days.map(day => (
                <div
                  key={day.id}
                  className="flex items-center justify-between p-2 bg-app-surface-muted rounded-lg"
                >
                  <span className="text-sm font-medium text-app-text">
                    День {day.id}
                  </span>
                  {day.completed && (
                    <span className="text-xs text-app-success font-medium">
                      Прочитано
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleClearSelection}
                className="flex-1 px-3 py-2 bg-app-surface-muted text-app-text-secondary text-sm font-semibold rounded-lg hover:bg-app-surface-elevated transition-colors"
              >
                Отмена
              </button>
              {selectedDaysInfo.uncompletedCount > 0 && (
                <button
                  onClick={handleMarkSelected}
                  className="flex-1 px-3 py-2 bg-app-success text-app-text-inverse text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                >
                  <Check size={16} strokeWidth={3} />
                  <span>Отметить</span>
                </button>
              )}
              {selectedDaysInfo.completedCount > 0 && (
                <button
                  onClick={handleUnmarkSelected}
                  className="flex-1 px-3 py-2 bg-app-surface-elevated text-app-text text-sm font-semibold rounded-lg hover:bg-app-border transition-colors flex items-center justify-center gap-1.5"
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
              <span className="text-xl font-bold text-app-text">День {selectedDay.id}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleComplete(selectedDay.id);
                }}
                className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                  selectedDay.completed 
                    ? 'bg-app-success/15 text-app-success hover:bg-app-success/25' 
                    : 'bg-app-surface-muted text-app-text-secondary hover:bg-app-surface-elevated'
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
            className="px-4 py-2.5 bg-app-success text-app-text-inverse text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 shadow-app-md active:scale-95"
          >
            <Check size={18} strokeWidth={3} />
            <span>Отметить пропущенные</span>
            <span className="bg-black/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
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
