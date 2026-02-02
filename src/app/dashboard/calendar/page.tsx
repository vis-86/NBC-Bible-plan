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
import { parseReadingItem } from '@/shared/utils/bible';
import { BibleReference } from '@/types';

export default function CalendarPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { plan, loading, error, fetchPlan } = usePlan();
  const { toggleItem, toggleComplete } = useProgress();

  useEffect(() => {
    if (!authLoading && user && plan.length === 0) {
      fetchPlan();
    }
  }, [authLoading, user, plan.length, fetchPlan]);

  const handleSelectReading = (day: any, reading: BibleReference) => {
    const item = day.items.find((i: any) => {
      const itemReading = parseReadingItem(i.readText);
      return itemReading && itemReading.book === reading.book && itemReading.chapter === reading.chapter;
    });
    
    let path = `/dashboard/read/${encodeURIComponent(reading.book)}/${reading.chapter}`;
    
    if (item) {
      path += `?day=${day.id}&item=${item.item}`;
    }
    
    // Переход к чтению - BottomSheet закроется автоматически при навигации
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

  if (authLoading || (loading && plan.length === 0)) {
    return (
      <DashboardLayout currentView={AppView.PLAN} onChangeView={() => {}}>
        <div className="flex min-h-screen items-center justify-center bg-stone-50">
          <div className="text-stone-600">Загрузка...</div>
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
      <CalendarView
        plan={plan}
        onSelectReading={handleSelectReading}
        onToggleComplete={handleToggleComplete}
        onToggleItem={handleToggleItem}
        onBack={() => router.push('/dashboard')}
      />
    </DashboardLayout>
  );
}
