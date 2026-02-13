'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppView, BibleReference } from '@/types';
import { parseReadingItem } from '@/shared/utils/bible';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PlanView } from '@/features/plan/components/PlanView';
import PastorChat from '@/components/PastorChat';
import ReferenceTool from '@/components/ReferenceTool';
import { isAIEnabled } from '@/shared/utils/constants';
import { usePlan } from '@/features/plan/hooks/usePlan';
import { useProgress } from '@/features/plan/hooks/useProgress';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { preloadChapters } from '@/features/reading/bible-text-cache';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>(AppView.PLAN);
  const hasInitialized = useRef(false);
  const lastUserId = useRef<string | null>(null);
  const hasLoadedPlan = useRef(false);

  const { plan, readChapters, loading, error, fetchPlan, setReadChapters } = usePlan();
  const { toggleItem, toggleComplete } = useProgress();

  useEffect(() => {
    if (authLoading) return;

    const currentUserId = user?.directus_id || null;
    if (lastUserId.current !== currentUserId) {
      hasInitialized.current = false;
      hasLoadedPlan.current = false;
      lastUserId.current = currentUserId;
    }

    if (plan.length > 0) {
      hasInitialized.current = true;
      return;
    }

    if (hasInitialized.current) return;

    const initialize = async () => {
      hasInitialized.current = true;

      if (!user) {
        return;
      }

      try {
        await fetchPlan();
      } catch (err) {
        console.error('[Dashboard] Error in fetchPlan:', err);
      }
    };

    initialize();
  }, [fetchPlan, user, authLoading, plan.length]);

  useEffect(() => {
    if (plan.length === 0 || hasLoadedPlan.current) return;

    const filteredPlan = plan.filter((d) => d.id > 0);
    if (filteredPlan.length === 0) return;

    const getDayOfYear = (date: Date): number => {
      const start = new Date(date.getFullYear(), 0, 0);
      const diff = date.getTime() - start.getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    };

    const now = new Date();
    const dayOfYear = getDayOfYear(now);
    const maxDayNumber = Math.max(...filteredPlan.map((d) => d.id));
    const planDayNumber = dayOfYear > maxDayNumber ? maxDayNumber : dayOfYear;
    const todayDay = filteredPlan.find((d) => d.id === planDayNumber) ?? filteredPlan[0];
    const readings = todayDay?.readings ?? [];

    if (readings.length > 0) {
      hasLoadedPlan.current = true;
      preloadChapters(readings);
    }
  }, [plan]);

  useEffect(() => {
    if (currentView === AppView.READER) {
      // При выборе вида READER перенаправляем на страницу чтения
      // Если нет сохраненного последнего прочтения, открываем Бытие 1
      router.push('/dashboard/read/Бытие/1');
    }
  }, [currentView, router]);

  const handleSelectReading = (day: any, reading: BibleReference) => {
    const item = day.items.find((i: any) => {
      const itemReading = parseReadingItem(i.readText);
      return itemReading && itemReading.book === reading.book && itemReading.chapter === reading.chapter;
    });
    
    let path = `/dashboard/read/${encodeURIComponent(reading.book)}/${reading.chapter}`;
    
    if (item) {
      path += `?day=${day.id}&item=${item.item}`;
    }
    
    router.push(path);
  };
  
  const handleChapterRead = async (dayId: number, itemNumber: number) => {
    try {
      await toggleItem(dayId, itemNumber);
      // Не вызываем fetchPlan() - оптимистичное обновление через GraphQL уже применено
      // Состояние обновляется локально через setPlan в useProgress
    } catch (error) {
      console.error('Error toggling item:', error);
      // При ошибке обновляем данные для синхронизации
      await fetchPlan();
    }
  };

  const handleToggleComplete = async (dayId: number) => {
    try {
      await toggleComplete(dayId);
      // Не вызываем fetchPlan() - оптимистичное обновление через GraphQL уже применено
      // Состояние обновляется локально через setPlan в useProgress
    } catch (error) {
      console.error('Error toggling complete:', error);
      // При ошибке обновляем данные для синхронизации
      await fetchPlan();
    }
  };

  const handleToggleItem = async (dayId: number, itemNumber: number) => {
    try {
      await toggleItem(dayId, itemNumber);
      // Не вызываем fetchPlan() - оптимистичное обновление через GraphQL уже применено
      // Состояние обновляется локально через setPlan в useProgress
    } catch (error) {
      console.error('Error toggling item:', error);
      // При ошибке обновляем данные для синхронизации
      await fetchPlan();
    }
  };

  const handleToggleChapter = (book: string, chapter: number) => {
    const key = `${book}_${chapter}`;
    setReadChapters(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Показываем загрузку только при первой загрузке (когда данных еще нет)
  if (authLoading || (loading && plan.length === 0)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-stone-900">
        <div className="text-stone-600 dark:text-stone-400">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const renderContent = () => {
    if (error) {
      return (
        <ErrorMessage
          message={error}
          onRetry={fetchPlan}
        />
      );
    }

    return (
      <>
        {/* Рендерим все компоненты всегда, но показываем только активный через CSS */}
        {/* Это сохраняет состояние компонентов при переключении табов */}
        <div className={currentView === AppView.PLAN ? 'block h-full' : 'hidden'}>
          <PlanView 
            plan={plan} 
            readChapters={readChapters}
            onSelectReading={handleSelectReading}
            onToggleComplete={handleToggleComplete}
            onToggleItem={handleToggleItem}
            onToggleChapter={handleToggleChapter}
            userName={user?.first_name}
          />
        </div>
        {isAIEnabled() && (
          <>
            <div className={currentView === AppView.CHAT ? 'block h-full' : 'hidden'}>
              <PastorChat />
            </div>
            <div className={currentView === AppView.REFERENCE ? 'block h-full' : 'hidden'}>
              <ReferenceTool />
            </div>
          </>
        )}
        {/* READER обрабатывается через редирект в useEffect */}
      </>
    );
  };

  return (
    <DashboardLayout currentView={currentView} onChangeView={setCurrentView}>
      {renderContent()}
    </DashboardLayout>
  );
}
