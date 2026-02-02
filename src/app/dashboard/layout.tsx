'use client';

import { PlanProvider } from '@/features/plan/contexts/PlanContext';

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlanProvider>
      {children}
    </PlanProvider>
  );
}
