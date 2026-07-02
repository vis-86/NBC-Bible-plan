'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePlanContext } from '../contexts/PlanContext';
import { ReadingPlanDay, BibleReference } from '@/types';
import BibleProgress from '@/components/BibleProgress';
import { VerseOfTheDay } from './VerseOfTheDay';
import { DayNavigationBar } from './DayNavigationBar';
import { TodayReadingCard } from './TodayReadingCard';
import { CompletionModal } from '@/features/reading/components/CompletionModal';
import { parseReadingItem, normalizeBookNameForUrl } from '@/shared/utils/bible';
import { getWeekDateRange, getWeekNumber, formatDateDDMM, formatHeaderDate, pluralizeDays } from '@/shared/utils/date';
import { weeklyPlanApi, WeeklyPlanWeek } from '@/shared/services/api/endpoints';
import { ApiClientError } from '@/shared/services/api/client';

interface PlanViewProps {
  plan: ReadingPlanDay[];
  readChapters: Set<string>;
  onSelectReading: (day: ReadingPlanDay, reading: BibleReference) => void;
  onToggleComplete: (dayId: number) => Promise<void>;
  onToggleItem: (dayId: number, itemNumber: number) => Promise<void>;
  onToggleChapter: (book: string, chapter: number) => void;
  userName?: string;
}

export const PlanView: React.FC<PlanViewProps> = ({
  plan,
  readChapters,
  onSelectReading,
  onToggleComplete,
  onToggleItem,
  onToggleChapter,
  userName = 'Пользователь'
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedDayId, setSelectedDayId, isPending } = usePlanContext();
  const [showDetailedProgress, setShowDetailedProgress] = useState(false);
  const [lastCompletedDay, setLastCompletedDay] = useState<ReadingPlanDay | null>(null);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [weeklyWeeks, setWeeklyWeeks] = useState<WeeklyPlanWeek[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const prevCompletedDaysRef = useRef<Set<number>>(new Set());
  const isInitializedRef = useRef<boolean>(false);

  const filteredPlan = useMemo(() => plan.filter(d => d.id > 0), [plan]);

  const weekRangeLabel = useMemo(() => {
    const { start, end } = getWeekDateRange(selectedWeek, new Date().getFullYear());
    return `${formatDateDDMM(start)} – ${formatDateDDMM(end)}`;
  }, [selectedWeek]);

  // Sync selectedDayId with URL
  useEffect(() => {
    const dayParam = searchParams.get('day');
    if (dayParam) {
      const dayId = parseInt(dayParam);
      if (!isNaN(dayId) && dayId !== selectedDayId) {
        setSelectedDayId(dayId);
      }
    }
  }, [searchParams, selectedDayId, setSelectedDayId]);

  const handleSelectDay = (id: number) => {
    setSelectedDayId(id);
    // Обновляем URL без перезагрузки страницы, используя window.history.replaceState
    // чтобы избежать ререндера всего Layout/Page через router.replace
    const url = new URL(window.location.href);
    url.searchParams.set('day', id.toString());
    window.history.replaceState(null, '', url.toString());
  };

  // Вычисляет день года (1-365/366)
  const getDayOfYear = (date: Date): number => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const todayDay = useMemo(() => {
    if (filteredPlan.length === 0) return null;

    const now = new Date();
    const dayOfYear = getDayOfYear(now);

    // Находим максимальный номер дня в плане
    const maxDayNumber = Math.max(...filteredPlan.map(d => d.id));

    // Вычисляем номер дня плана на основе дня года
    // Если день года больше максимального дня плана, показываем последний день
    // Каждый новый год план начинается сначала (день 1)
    const planDayNumber = dayOfYear > maxDayNumber ? maxDayNumber : dayOfYear;

    // Находим день плана с этим номером
    const day = filteredPlan.find(d => d.id === planDayNumber);

    return day || filteredPlan[0];
  }, [filteredPlan]);

  // Вычисляем номер сегодняшнего дня для навигации
  const todayDayNumber = useMemo(() => {
    if (filteredPlan.length === 0) return 1;
    const now = new Date();
    const dayOfYear = getDayOfYear(now);
    const maxDayNumber = Math.max(...filteredPlan.map(d => d.id));
    return dayOfYear > maxDayNumber ? maxDayNumber : dayOfYear;
  }, [filteredPlan]);

  // Дефолтная выбранная неделя (календарная, с учётом дня недели 1 января)
  useEffect(() => {
    const week = Math.min(52, Math.max(1, getWeekNumber(new Date())));
    setSelectedWeek(week);
  }, []);

  // Загружаем недельный план (старт: Притчи)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setWeeklyLoading(true);
      setWeeklyError(null);
      try {
        const res = await weeklyPlanApi.getWeeklyPlan('proverbs');
        if (!cancelled) setWeeklyWeeks(res.weeks || []);
      } catch (e: unknown) {
        if (ApiClientError.isSessionExpired(e)) return;
        console.error('Error loading weekly plan:', e);
        if (!cancelled) setWeeklyError((e as Error)?.message || 'Ошибка загрузки недельного плана');
      } finally {
        if (!cancelled) setWeeklyLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Инициализируем выбранный день как сегодняшний
  useEffect(() => {
    if (todayDay && selectedDayId === null && !searchParams.get('day')) {
      setSelectedDayId(todayDay.id);
    }
  }, [todayDay, selectedDayId, setSelectedDayId, searchParams]);

  const selectedDay = useMemo(() => {
    if (selectedDayId === null) return null;
    return filteredPlan.find(d => d.id === selectedDayId) || null;
  }, [filteredPlan, selectedDayId]);

  // Пропущенные дни — прошедшие по плану, но не отмеченные завершёнными.
  const missedDaysCount = useMemo(
    () => filteredPlan.filter(d => d.id < todayDayNumber && !d.completed).length,
    [filteredPlan, todayDayNumber],
  );

  // Отслеживаем завершенные дни для показа модального окна
  // Показываем модалку при ручной отметке через "Отметить всё" на главном экране
  useEffect(() => {
    const currentCompletedDays = new Set(filteredPlan.filter(d => d.completed).map(d => d.id));

    // При первой инициализации просто сохраняем текущее состояние, не показывая модальное окно
    if (!isInitializedRef.current) {
      prevCompletedDaysRef.current = currentCompletedDays;
      isInitializedRef.current = true;
      return;
    }

    const prevCompletedDays = prevCompletedDaysRef.current;

    // Находим день, который только что был завершен
    const newlyCompletedDay = filteredPlan.find(d =>
      currentCompletedDays.has(d.id) && !prevCompletedDays.has(d.id)
    );

    if (newlyCompletedDay) {
      // День в плане уже с completed: true — useDayCompletion не видит переход false→true.
      // Открываем поздравление явно по факту появления дня в множестве завершённых.
      setLastCompletedDay(newlyCompletedDay);
      setCompletionModalOpen(true);
    }

    prevCompletedDaysRef.current = currentCompletedDays;
  }, [filteredPlan, todayDay]);

  // Сбрасываем отслеживаемый день после закрытия модального окна
  useEffect(() => {
    if (!completionModalOpen && lastCompletedDay) {
      setLastCompletedDay(null);
    }
  }, [completionModalOpen, lastCompletedDay]);

  const handleStartReading = () => {
    if (!selectedDay) return;
    const firstUnreadItem = selectedDay.items?.find((item) => !item.completed);
    if (firstUnreadItem) {
      const reading = parseReadingItem(firstUnreadItem.readText);
      if (reading) onSelectReading(selectedDay, reading);
    } else if (selectedDay.items?.length) {
      const firstReading = parseReadingItem(selectedDay.items[0].readText);
      if (firstReading) onSelectReading(selectedDay, firstReading);
    } else if (selectedDay.readings?.length) {
      onSelectReading(selectedDay, selectedDay.readings[0]);
    }
  };

  const handleMarkAllRead = async () => {
    if (!selectedDay) return;

    const dayItems = selectedDay.items ?? [];
    if (dayItems.length > 0) {
      const hasIncomplete = dayItems.some((item) => !item.completed);
      if (hasIncomplete) {
        // Один запрос UpdateProgress(count: null) — то же, что полное завершение дня в Directus
        await onToggleComplete(selectedDay.id);
      }
      return;
    }

    if (!selectedDay.completed) {
      await onToggleComplete(selectedDay.id);
    }
  };

  if (showDetailedProgress) {
    return (
      <BibleProgress
        readChapters={readChapters}
        onToggleChapter={onToggleChapter}
        onClose={() => setShowDetailedProgress(false)}
      />
    );
  }

  const completedDaysCount = filteredPlan.filter((d) => d.completed).length;
  const yearProgressPercent = filteredPlan.length > 0
    ? Math.round((completedDaysCount / filteredPlan.length) * 100)
    : 0;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Доброе утро';
    if (hour >= 12 && hour < 17) return 'Добрый день';
    if (hour >= 17 && hour < 22) return 'Добрый вечер';
    return 'Доброй ночи';
  };

  const headerDate = formatHeaderDate(new Date());

  return (
    <div data-plan-view className="flex flex-col h-full bg-app-bg text-app-text overflow-y-auto">
      <header data-plan-view-header className="px-6 pt-10 pb-2 flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p data-plan-view-date className="text-xs font-semibold text-app-text-muted uppercase tracking-wide">
              {headerDate}
            </p>
          </div>
          <h1 data-plan-view-greeting className="text-2xl font-serif font-medium text-app-text leading-tight">
            {getGreeting()}, <span className="text-app-text-muted">{userName}</span>
          </h1>
        </div>
      </header>

      <DayNavigationBar
        plan={plan}
        selectedDayId={selectedDayId}
        todayDayNumber={todayDayNumber}
        onSelectDay={handleSelectDay}
      />

      {selectedDay && (
        <TodayReadingCard
          day={selectedDay}
          totalDays={filteredPlan.length}
          isToday={selectedDayId === todayDayNumber}
          yearProgress={yearProgressPercent}
          onToggleItem={onToggleItem}
          onSelectReading={onSelectReading}
          onStartReading={handleStartReading}
          onMarkAllRead={handleMarkAllRead}
          markAllReadDisabled={isPending}
        />
      )}

      <div className="px-4 mb-6">
        <button
          type="button"
          data-plan-view-calendar-cta
          data-plan-view-calendar-cta-missed={missedDaysCount > 0 || undefined}
          onClick={() => router.push('/dashboard/calendar')}
          aria-label={
            missedDaysCount > 0
              ? `Открыть календарь, чтобы отметить ${missedDaysCount} пропущенных дней`
              : 'Открыть календарь'
          }
          className={
            missedDaysCount > 0
              ? 'w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-app-accent/20 bg-app-accent-muted text-app-accent font-semibold hover:bg-app-accent/20 active:scale-[0.99] transition-all'
              : 'w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-app-border bg-app-surface text-app-text-secondary font-semibold hover:bg-app-surface-muted hover:text-app-text active:scale-[0.99] transition-all'
          }
        >
          <Calendar size={18} aria-hidden />
          {missedDaysCount > 0
            ? `Пропущено ${missedDaysCount} ${pluralizeDays(missedDaysCount)} — отметить`
            : 'Открыть календарь'}
        </button>
      </div>

      <section data-plan-view-sections className="px-4 mb-6 grid grid-cols-1 gap-4">
        <div data-weekly-reading className="bg-app-surface p-5 rounded-3xl border border-app-border shadow-app-sm">
          <div data-weekly-reading-header className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-app-primary-light flex items-center justify-center text-app-primary flex-shrink-0" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 data-weekly-reading-title className="text-sm font-bold text-app-text">
                Недельное чтение
              </h3>
              <p data-weekly-reading-range className="text-xs text-app-text-muted mt-0.5">
                Притчи 9–12 • <span className="text-app-primary font-medium">{weekRangeLabel}</span>
              </p>
            </div>
            <div data-weekly-reading-nav className="flex gap-1 flex-shrink-0">
              <button
                type="button"
                data-weekly-reading-prev-btn
                onClick={() => setSelectedWeek((prev) => (prev <= 1 ? 52 : prev - 1))}
                className="p-1.5 rounded-lg text-app-text-muted hover:text-app-text-secondary hover:bg-app-surface-muted transition-colors"
                aria-label="Предыдущая неделя"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                data-weekly-reading-next-btn
                onClick={() => setSelectedWeek((prev) => (prev >= 52 ? 1 : prev + 1))}
                className="p-1.5 rounded-lg text-app-text-muted hover:text-app-text-secondary hover:bg-app-surface-muted transition-colors"
                aria-label="Следующая неделя"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div data-weekly-reading-list className="space-y-2">
            {weeklyLoading && (
              <div data-weekly-reading-loading className="text-xs text-app-text-muted py-2">Загрузка…</div>
            )}
            {!weeklyLoading && weeklyError && (
              <div data-weekly-reading-error className="text-xs text-app-accent py-2">{weeklyError}</div>
            )}
            {!weeklyLoading && !weeklyError &&
              (weeklyWeeks.find((w) => w.week === selectedWeek)?.items || []).map((it) => (
                <a
                  key={`${it.numbers}_${it.item}_${it.id}`}
                  data-weekly-reading-item={it.id}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    const ref = parseReadingItem(it.read);
                    if (ref) router.push(`/dashboard/read/${encodeURIComponent(normalizeBookNameForUrl(ref.book))}/${ref.chapter}`);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl bg-app-surface-muted hover:bg-app-surface-elevated transition-colors group"
                >
                  <span className="text-sm font-medium text-app-text-secondary group-hover:text-app-text">
                    {it.read}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-app-text-muted group-hover:text-app-text-secondary" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </a>
              ))}
            {!weeklyLoading && !weeklyError &&
              (weeklyWeeks.find((w) => w.week === selectedWeek)?.items || []).length === 0 && (
                <div data-weekly-reading-empty className="text-xs text-app-text-muted py-2">Нет чтений для этой недели.</div>
              )}
          </div>
        </div>

        <VerseOfTheDay />
      </section>

      <CompletionModal
        isOpen={completionModalOpen}
        onClose={() => setCompletionModalOpen(false)}
        day={lastCompletedDay}
        totalDays={filteredPlan.length}
        actionLabel="Отлично"
      />
    </div>
  );
};

export default PlanView;
