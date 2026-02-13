'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { usePlanContext } from '../contexts/PlanContext';
import { ReadingPlanDay, BibleReference } from '@/types';
import { BIBLE_STRUCTURE } from '@/lib/constants';
import BibleProgress from '@/components/BibleProgress';
import { ProgressWidget } from './ProgressWidget';
import { VerseOfTheDay } from './VerseOfTheDay';
import { DayNavigationBar } from './DayNavigationBar';
import { DayChaptersList } from './DayChaptersList';
import { useDayCompletion } from '../hooks/useDayCompletion';
import { CompletionModal } from '@/features/reading/components/CompletionModal';
import { parseReadingItem } from '@/shared/utils/bible';
import { getWeekDateRange, getWeekNumber, formatDateDDMM } from '@/shared/utils/date';
import { weeklyPlanApi, WeeklyPlanWeek } from '@/shared/services/api/endpoints';
import { ApiClientError } from '@/shared/services/api/client';
import { ChapterRow } from './ChapterRow';

interface PlanViewProps {
  plan: ReadingPlanDay[];
  readChapters: Set<string>;
  onSelectReading: (day: ReadingPlanDay, reading: BibleReference) => void;
  onToggleComplete: (dayId: number) => Promise<void>;
  onToggleItem: (dayId: number, itemNumber: number) => void;
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
  const { selectedDayId, setSelectedDayId } = usePlanContext();
  const [showDetailedProgress, setShowDetailedProgress] = useState(false);
  const [lastCompletedDay, setLastCompletedDay] = useState<ReadingPlanDay | null>(null);
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

  const handleNavigateToNextDay = () => {
    if (!selectedDay) return;

    const currentIndex = filteredPlan.findIndex(d => d.id === selectedDay.id);
    const nextDay = filteredPlan[currentIndex + 1];

    if (nextDay) {
      handleSelectDay(nextDay.id);
    }
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
      // Показываем модалку при ручной отметке через "Отметить всё"
      setLastCompletedDay(newlyCompletedDay);
    }

    prevCompletedDaysRef.current = currentCompletedDays;
  }, [filteredPlan, todayDay]);

  const handleToggleCompleteInternal = async (dayId: number) => {
    await onToggleComplete(dayId);
  };

  // В PlanView показываем модалку только при ручной отметке (переход false -> true)
  // alwaysShowIfCompleted: false, так как lastCompletedDay устанавливается только для только что завершенных дней
  const completion = useDayCompletion(lastCompletedDay, { todayDay, alwaysShowIfCompleted: false });

  // Сбрасываем отслеживаемый день после закрытия модального окна
  useEffect(() => {
    if (!completion.showModal && lastCompletedDay) {
      setLastCompletedDay(null);
    }
  }, [completion.showModal, lastCompletedDay]);

  const stats = useMemo(() => {
    const totalChapters = BIBLE_STRUCTURE.reduce((acc, b) => acc + b.chapters, 0);
    const readCount = readChapters.size;
    const percentage = totalChapters > 0 ? Math.round((readCount / totalChapters) * 100) : 0;
    return { readCount, totalChapters, percentage };
  }, [readChapters]);

  if (showDetailedProgress) {
    return (
      <BibleProgress
        readChapters={readChapters}
        onToggleChapter={onToggleChapter}
        onClose={() => setShowDetailedProgress(false)}
      />
    );
  }

  const completedDaysCount = filteredPlan.filter(d => d.completed).length;
  const streak = completedDaysCount > 0 ? completedDaysCount : 0;

  const date = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Доброе утро';
    } else if (hour >= 12 && hour < 17) {
      return 'Добрый день';
    } else if (hour >= 17 && hour < 22) {
      return 'Добрый вечер';
    } else {
      return 'Доброй ночи';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[rgb(245,245,247)] dark:bg-stone-900 overflow-y-auto pb-20">
      {/* Top App Bar — z-20 чтобы оставаться поверх недельного блока при скролле */}
      <div className="bg-white/75 dark:bg-stone-800/80 backdrop-blur-xl px-5 py-2 flex justify-between items-center sticky top-0 z-20 border-b border-black/5 dark:border-white/10">
        <div>
          <h1 className="font-bold text-stone-900 dark:text-stone-100 capitalize">{date}</h1>
          <p className="text-stone-500 dark:text-stone-400 font-medium">{getGreeting()}, {userName}</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1 text-red-500 dark:text-red-400 font-bold bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full text-xs">
            <Flame size={14} className="fill-current" />
            <span>{streak}</span>
          </div>
        </div>
      </div>

      <div className=" space-y-6">
        {/* Sections */}
        <div className="space-y-6">
          {/* Weekly Plan (Proverbs) - featured above daily plan */}
          <div className="relative overflow-hidden rounded-none bg-gradient-to-br from-stone-800 via-stone-800/95 to-stone-800/90 group cursor-pointer transition-shadow px-4 py-6 shadow-md text-stone-100">
            <div
              className="absolute inset-0 opacity-30 pointer-events-none bg-cover bg-center"
              style={{
                backgroundImage: `url('${process.env.NEXT_PUBLIC_BASE_PATH || ''}/liquid-cheese.svg')`
              }}
              aria-hidden
            />
            <div>

              <div className="flex items-center justify-between gap-2 px-1 relative z-10">
                <div className="font-bold text-stone-100 uppercase tracking-wider pl-3">
                  <div className="text-base sm:text-lg">НЕДЕЛЬНЫЕ ЧТЕНИЯ #{selectedWeek}</div>
                  <div className="text-sm text-stone-400">
                    {weekRangeLabel}
                  </div>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedWeek((prev) => (prev <= 1 ? 52 : prev - 1))}
                    className="p-1.5 rounded-lg text-stone-300 hover:text-stone-100 hover:bg-white/10 transition-colors active:scale-95 flex-shrink-0"
                    aria-label="Предыдущая неделя"
                    title="Предыдущая неделя"
                  >
                    <ChevronLeft size={22} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedWeek((prev) => (prev >= 52 ? 1 : prev + 1))}
                    className="p-1.5 rounded-lg text-stone-300 hover:text-stone-100 hover:bg-white/10 transition-colors active:scale-95 flex-shrink-0"
                    aria-label="Следующая неделя"
                    title="Следующая неделя"
                  >
                    <ChevronRight size={22} />
                  </button>
                </div>
              </div>
            </div>
            <div className="">
              <div className="ring-black/10 ">
                <div className="mt-3 text-stone-100 [&_svg]:text-stone-400">
                  {weeklyLoading && <div className="text-xs text-stone-400">Загрузка…</div>}
                  {!weeklyLoading && weeklyError && (
                    <div className="text-xs text-red-400">{weeklyError}</div>
                  )}
                  {!weeklyLoading && !weeklyError && (
                    <div className="space-y-3 px-4">
                      {(weeklyWeeks.find(w => w.week === selectedWeek)?.items || []).map((it) => (
                        <ChapterRow
                          key={`${it.numbers}_${it.item}_${it.id}`}
                          text={it.read}
                          textClassName="text-stone-100"
                          className="bg-white/10"
                          onClick={() => {
                            const ref = parseReadingItem(it.read);
                            if (!ref) return;
                            router.push(`/dashboard/read/${encodeURIComponent(ref.book)}/${ref.chapter}`);
                          }}
                        />
                      ))}
                      {(weeklyWeeks.find(w => w.week === selectedWeek)?.items || []).length === 0 && (
                        <div className="text-xs text-stone-400">Нет чтений для этой недели.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 1. Day Navigation Bar */}
          <div className="space-y-4">
            <DayNavigationBar
              plan={plan}
              selectedDayId={selectedDayId}
              todayDayNumber={todayDayNumber}
              onSelectDay={handleSelectDay}
            />

            {/* Детальный вид выбранного дня */}
            {selectedDay && (
              <div className="card-apple overflow-hidden mx-4">
                <DayChaptersList
                  day={selectedDay}
                  todayDayNumber={todayDayNumber}
                  totalDays={filteredPlan.length}
                  onToggleItem={onToggleItem}
                  onToggleComplete={handleToggleCompleteInternal}
                  onSelectReading={onSelectReading}
                  onStartReading={() => {
                    const firstUnreadItem = selectedDay.items?.find(item => !item.completed);
                    if (firstUnreadItem) {
                      const reading = parseReadingItem(firstUnreadItem.readText);
                      if (reading) {
                        onSelectReading(selectedDay, reading);
                      }
                    } else if (selectedDay.items && selectedDay.items.length > 0) {
                      const firstReading = parseReadingItem(selectedDay.items[0].readText);
                      if (firstReading) {
                        onSelectReading(selectedDay, firstReading);
                      }
                    } else if (selectedDay.readings && selectedDay.readings.length > 0) {
                      onSelectReading(selectedDay, selectedDay.readings[0]);
                    }
                  }}
                  onNavigateToNextDay={
                    // Показываем кнопку перехода к следующему дню только если это не последний день
                    filteredPlan.findIndex(d => d.id === selectedDay.id) < filteredPlan.length - 1
                      ? handleNavigateToNextDay
                      : undefined
                  }
                />
              </div>
            )}
          </div>

          {/* Bible Progress Card */}
          <div className="space-y-4 px-4">
            <ProgressWidget
              readCount={stats.readCount}
              totalChapters={stats.totalChapters}
              percentage={stats.percentage}
              onClick={() => setShowDetailedProgress(true)}
            />
          </div>
        </div>

        {/* Verse of the Day Card - moved to bottom for better visual hierarchy */}
        <div className="mt-8 px-4">
          <VerseOfTheDay />
        </div>
      </div>

      <CompletionModal
        isOpen={completion.showModal}
        onClose={completion.closeModal}
        day={lastCompletedDay}
        totalDays={filteredPlan.length}
      />
    </div>
  );
};

export default PlanView;
