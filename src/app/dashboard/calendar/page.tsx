'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { usePlan } from '@/features/plan/hooks/usePlan';
import { useProgress } from '@/features/plan/hooks/useProgress';
import { CalendarView } from '@/features/plan/components/CalendarView';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { AppView } from '@/types';
import { parseReadingItem, normalizeBookNameForUrl } from '@/shared/utils/bible';
import { BibleReference } from '@/types';

export default function CalendarPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { plan, loading, error, fetchPlan } = usePlan();
  const { toggleItem, toggleComplete, toggleCompleteMany } = useProgress();

  useEffect(() => {
    if (!authLoading && user && plan.length === 0) {
      fetchPlan();
    }
  }, [authLoading, user, plan.length, fetchPlan]);

  const handleSelectReading = (day: any, reading: BibleReference) => {
    const normalizedBook = normalizeBookNameForUrl(reading.book);
    const item = day.items.find((i: any) => {
      const itemReading = parseReadingItem(i.readText);
      return itemReading && normalizeBookNameForUrl(itemReading.book) === normalizedBook && itemReading.chapter === reading.chapter;
    });

    const query = new URLSearchParams({ book: normalizedBook, chapter: String(reading.chapter) });
    if (item) {
      query.set('day', String(day.id));
      query.set('item', String(item.item));
    }

    router.push(`/dashboard/read?${query.toString()}`);
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

  const handleToggleCompleteMany = async (dayIds: number[], completed: boolean) => {
    try {
      await toggleCompleteMany(dayIds, completed);
    } catch (error) {
      console.error('Error toggling multiple days:', error);
      await fetchPlan();
    }
  };

  if (authLoading || (loading && plan.length === 0)) {
    return (
      <DashboardLayout currentView={AppView.PLAN} onChangeView={() => {}}>
        <div className="flex min-h-screen items-center justify-center bg-app-bg">
          <div className="text-app-text-muted">Загрузка...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return null;
  }

  if (error) {
    return (
      <DashboardLayout currentView={AppView.PLAN} onChangeView={() => {}}>
        <ErrorMessage
          message={error}
          onRetry={fetchPlan}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout currentView={AppView.PLAN} onChangeView={() => {}} hideBottomNav={true}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CalendarView
        plan={plan}
        onSelectReading={handleSelectReading}
        onToggleComplete={handleToggleComplete}
        onToggleItem={handleToggleItem}
        onToggleCompleteMany={handleToggleCompleteMany}
        onBack={() => router.push('/dashboard')}
      />
      </div>
    </DashboardLayout>
  );
}
