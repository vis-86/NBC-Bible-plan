'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const viewParam = searchParams.get('view');
  const initialView = viewParam === 'chat' ? AppView.CHAT : AppView.PLAN;
  console.debug('[DashboardPage] view from URL param', { viewParam, initialView });

  const [currentView, setCurrentView] = useState<AppView>(initialView);
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
      router.push('/dashboard/read/Бытие/1');
    }
  }, [currentView, router]);

  const handleChangeView = (view: AppView) => {
    setCurrentView(view);
    if (view === AppView.CHAT) {
      router.replace('/dashboard?view=chat', { scroll: false });
    } else if (view === AppView.PLAN) {
      router.replace('/dashboard', { scroll: false });
    }
  };

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

  const handleToggleComplete = async (dayId: number) => {
    try {
      await toggleComplete(dayId);
    } catch (error) {
      console.error('Error toggling complete:', error);
      await fetchPlan();
    }
  };

  const handleToggleItem = async (dayId: number, itemNumber: number) => {
    try {
      await toggleItem(dayId, itemNumber);
    } catch (error) {
      console.error('Error toggling item:', error);
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

  if (authLoading || (loading && plan.length === 0)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg">
        <div className="text-app-text-muted">Загрузка...</div>
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
      </>
    );
  };

  return (
    <DashboardLayout currentView={currentView} onChangeView={handleChangeView}>
      {renderContent()}
    </DashboardLayout>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-app-bg">
          <div className="text-app-text-muted">Загрузка...</div>
        </div>
      }
    >
      <DashboardPageInner />
    </Suspense>
  );
}
