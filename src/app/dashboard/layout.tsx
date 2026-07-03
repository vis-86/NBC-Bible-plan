'use client';

import { useEffect } from 'react';
import { PlanProvider } from '@/features/plan/contexts/PlanContext';
import { replayOutbox, registerSyncTriggers } from '@/shared/offline/sync';

/**
 * Sync-провайдер (Task 26/30, .ai-factory/plans/feature-offline-pwa.md): replay outbox
 * на старте приложения + подписка на visibilitychange/online-триггеры на весь dashboard.
 */
function useOfflineSync() {
  useEffect(() => {
    void replayOutbox(); // app start
    return registerSyncTriggers();
  }, []);
}

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useOfflineSync();

  return (
    <PlanProvider>
      {children}
    </PlanProvider>
  );
}
