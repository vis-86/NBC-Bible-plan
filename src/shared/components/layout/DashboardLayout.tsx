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
    <div data-dashboard-layout className="flex flex-col h-screen bg-app-bg text-app-text font-sans overflow-hidden">
      <main data-dashboard-layout-main className="flex-1 overflow-hidden relative w-full">
        <div className="max-w-md mx-auto h-full bg-app-bg md:shadow-xl">
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
