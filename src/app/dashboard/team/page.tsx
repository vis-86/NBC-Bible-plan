'use client';

import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { TeamScreen } from '@/features/team/components/TeamScreen';

export default function TeamPage() {
  return (
    <DashboardLayout onChangeView={() => {}}>
      <TeamScreen />
    </DashboardLayout>
  );
}
