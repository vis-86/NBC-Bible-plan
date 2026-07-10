'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ReadingView } from '@/features/reading/components/ReadingView';
import { BibleReference, ReadingPlanDay, PlanItem } from '@/types';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { AppView } from '@/types';
import { usePlan } from '@/features/plan/hooks/usePlan';
import { useProgress } from '@/features/plan/hooks/useProgress';
import { saveLastReadLocation } from '@/features/reading/last-read-location';

/**
 * Единый клиентский маршрут ридера (approach C, FIX_PLAN): book/chapter/day/item живут
 * в search-параметрах, а не в сегментах `[book]/[chapter]`. Search не меняет сегмент
 * маршрута → один и тот же документ/RSC-shell обслуживает ЛЮБУЮ главу. Это убирает
 * бесконечность динамических URL: офлайн один закешированный документ `/dashboard/read`
 * (SW отдаёт его по ignoreSearch) открывает любую главу из IndexedDB.
 */
function ReadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { plan, loading: planLoading, error: planError, fetchPlan: refreshPlan } = usePlan();
  const { toggleItem } = useProgress();
  const [localError, setLocalError] = useState<string | null>(null);

  const bookParam = searchParams.get('book');
  const chapterParam = searchParams.get('chapter');
  const book = bookParam ? decodeURIComponent(bookParam) : '';
  const chapter = chapterParam ? parseInt(chapterParam) : NaN;
  const dayId = searchParams.get('day') ? parseInt(searchParams.get('day')!) : null;
  const itemNumber = searchParams.get('item') ? parseInt(searchParams.get('item')!) : null;

  const reading: BibleReference | null = book && Number.isFinite(chapter) ? { book, chapter } : null;

  // Запоминаем последнее открытое место чтения — таб «Библия» вернёт сюда,
  // а не на жёстко зашитое Бытие 1 (см. last-read-location.ts).
  useEffect(() => {
    if (book && Number.isFinite(chapter)) {
      saveLastReadLocation({ book, chapter });
    }
  }, [book, chapter]);

  // Текущий день/пункт — чистая деривация из плана и параметров URL (не state+effect):
  // так избегаем каскадных ре-рендеров от setState-в-эффекте и рассинхрона.
  const currentDay: ReadingPlanDay | null = useMemo(() => {
    if (!plan || plan.length === 0 || !dayId) return null;
    return plan.find(d => d.id === dayId) ?? null;
  }, [plan, dayId]);

  const currentItem: PlanItem | null = useMemo(() => {
    if (!currentDay || !itemNumber) return null;
    return currentDay.items.find(i => i.item === itemNumber) ?? null;
  }, [currentDay, itemNumber]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/dashboard');
      return;
    }

    if (plan.length === 0) {
      refreshPlan();
    }
  }, [authLoading, user, plan.length, refreshPlan, router]);

  const handleChapterRead = async (dayId: number, itemNumber: number) => {
    if (!user) return;
    try {
      await toggleItem(dayId, itemNumber);
    } catch (err) {
      console.error('Error marking chapter as read:', err);
      setLocalError((err as Error)?.message || 'Ошибка при обновлении прогресса');
      throw err;
    }
  };

  const handleBack = () => {
    // Возвращаемся на дашборд с сохранением выбранного дня
    const backUrl = dayId ? `/dashboard?day=${dayId}` : '/dashboard';
    router.push(backUrl);
  };

  const handleNavigateChapter = (newBook: string, newChapter: number, newDayId?: number, newItemNumber?: number) => {
    const query = new URLSearchParams({ book: newBook, chapter: String(newChapter) });
    if (newDayId && newItemNumber) {
      query.set('day', String(newDayId));
      query.set('item', String(newItemNumber));
    }
    router.push(`/dashboard/read?${query.toString()}`);
  };

  const loading = authLoading || (planLoading && plan.length === 0);
  const error = localError || planError;

  if (loading) {
    return (
      <DashboardLayout currentView={AppView.READER} onChangeView={() => {}}>
        <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-stone-900">
          <div className="text-stone-600 dark:text-stone-400">Загрузка...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout currentView={AppView.READER} onChangeView={() => {}}>
        <div className="flex flex-col items-center justify-center p-8 text-center h-full">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
            <h3 className="text-red-800 font-bold mb-2">Ошибка загрузки</h3>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Вернуться
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!reading) {
    return (
      <DashboardLayout currentView={AppView.READER} onChangeView={() => {}}>
        <div className="flex flex-col items-center justify-center h-full p-8 text-stone-400 dark:text-stone-500 bg-white dark:bg-stone-900">
          <h3 className="text-lg font-bold text-stone-700 dark:text-stone-300 mb-2">Ошибка</h3>
          <p className="text-center text-stone-500 dark:text-stone-400 mb-8 max-w-xs">Неверные параметры страницы.</p>
          <button
            onClick={handleBack}
            className="px-8 py-3 bg-red-600 text-white rounded-full font-bold shadow-lg active:scale-95 transition-transform"
          >
            Вернуться
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout currentView={AppView.READER} onChangeView={() => {}}>
      <ReadingView
        reading={reading}
        onBack={handleBack}
        day={currentDay}
        totalDays={plan.length}
        currentItem={currentItem}
        onChapterRead={handleChapterRead}
        onNavigateChapter={handleNavigateChapter}
      />
    </DashboardLayout>
  );
}

export default function ReadPage() {
  // useSearchParams требует Suspense-границу в App Router (иначе весь маршрут
  // помечается динамическим и билд предупреждает/падает на prerender).
  return (
    <Suspense
      fallback={
        <DashboardLayout currentView={AppView.READER} onChangeView={() => {}}>
          <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-stone-900">
            <div className="text-stone-600 dark:text-stone-400">Загрузка...</div>
          </div>
        </DashboardLayout>
      }
    >
      <ReadPageContent />
    </Suspense>
  );
}
