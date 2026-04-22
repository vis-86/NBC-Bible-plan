'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AppView } from '@/types';
import BottomNavBar from './BottomNavBar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentView?: AppView;
  onChangeView?: (view: AppView) => void;
  hideBottomNav?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, onChangeView, hideBottomNav = false }) => {
  const pathname = usePathname();
  const isReaderPage = pathname.includes('/read/');

  return (
    <div data-dashboard-layout className="flex flex-col h-dvh min-h-0 bg-app-bg text-app-text font-sans overflow-hidden">
      <main
        data-dashboard-layout-main
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-md flex-1 flex-col bg-app-bg md:shadow-xl">
          {children}
        </div>
      </main>

      {!isReaderPage && !hideBottomNav && (
        <BottomNavBar onChangeView={onChangeView} />
      )}
    </div>
  );
};

export default DashboardLayout;
