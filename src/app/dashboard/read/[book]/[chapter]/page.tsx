'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ReadingView } from '@/features/reading/components/ReadingView';
import { BibleReference, ReadingPlanDay, PlanItem } from '@/types';
import { parseReadingItem } from '@/shared/utils/bible';
import { getApiPath } from '@/shared/utils/api';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { AppView } from '@/types';
import { usePlan } from '@/features/plan/hooks/usePlan';
import { useProgress } from '@/features/plan/hooks/useProgress';

export default function ReadPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { plan, loading: planLoading, error: planError, fetchPlan: refreshPlan } = usePlan();
  const { toggleItem } = useProgress();
  const [currentDay, setCurrentDay] = useState<ReadingPlanDay | null>(null);
  const [currentItem, setCurrentItem] = useState<PlanItem | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const book = decodeURIComponent(params.book as string);
  const chapter = parseInt(params.chapter as string);
  const dayId = searchParams.get('day') ? parseInt(searchParams.get('day')!) : null;
  const itemNumber = searchParams.get('item') ? parseInt(searchParams.get('item')!) : null;

  const reading: BibleReference | null = book && chapter ? { book, chapter } : null;

  // Вычисляем номер сегодняшнего дня для определения пропущенных дней
  const getDayOfYear = (date: Date): number => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const todayDayNumber = getDayOfYear(new Date());

  const updateCurrentDayAndItem = useCallback(() => {
    if (!plan || plan.length === 0 || !dayId) return;

    const targetDay = plan.find(d => d.id === dayId);
    if (targetDay) {
      setCurrentDay(targetDay);
      if (itemNumber) {
        const item = targetDay.items.find(i => i.item === itemNumber);
        setCurrentItem(item || null);
      } else {
        setCurrentItem(null);
      }
    }
  }, [plan, dayId, itemNumber]);

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

  useEffect(() => {
    updateCurrentDayAndItem();
  }, [updateCurrentDayAndItem]);

  const handleChapterRead = async (dayId: number, itemNumber: number) => {
    if (!user) return;
    try {
      await toggleItem(dayId, itemNumber);
    } catch (err: any) {
      console.error('Error marking chapter as read:', err);
      setLocalError(err.message || 'Ошибка при обновлении прогресса');
      throw err;
    }
  };

  const handleBack = () => {
    // Возвращаемся на дашборд с сохранением выбранного дня
    const backUrl = dayId ? `/dashboard?day=${dayId}` : '/dashboard';
    router.push(backUrl);
  };

  const handleNavigateChapter = (newBook: string, newChapter: number, newDayId?: number, newItemNumber?: number) => {
    let path = `/dashboard/read/${encodeURIComponent(newBook)}/${newChapter}`;
    
    if (newDayId && newItemNumber) {
      path += `?day=${newDayId}&item=${newItemNumber}`;
    }
    
    router.push(path);
  };

  const loading = authLoading || (planLoading && plan.length === 0);
  const error = localError || planError;

  if (loading) {
    return (
      <DashboardLayout currentView={AppView.READER} onChangeView={() => {}}>
        <div className="flex min-h-screen items-center justify-center bg-stone-50">
          <div className="text-stone-600">Загрузка...</div>
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
        <div className="flex flex-col items-center justify-center h-full p-8 text-stone-400 bg-white">
          <h3 className="text-lg font-bold text-stone-700 mb-2">Ошибка</h3>
          <p className="text-center text-stone-500 mb-8 max-w-xs">Неверные параметры страницы.</p>
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
        todayDayNumber={todayDayNumber}
      />
    </DashboardLayout>
  );
}

