'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppView } from '@/types';
import BottomNavBar from './BottomNavBar';
import { warmAppShellOnceOnline } from '@/shared/offline/appShell';

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentView?: AppView;
  onChangeView?: (view: AppView) => void;
  hideBottomNav?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, onChangeView, hideBottomNav = false }) => {
  const pathname = usePathname();

  // Прогрев app-shell документов в HTML-кеш SW при онлайн-загрузке приложения
  // (один раз за сессию). Даёт офлайн-навигацию к маршрутам, куда ходят клиентским
  // push (песни/Библия/календарь) — иначе офлайн они падают в 503-заглушку.
  // DashboardLayout рендерится только для аутентифицированных дашборд-страниц —
  // значит контекст всегда залогинен, `/dashboard/*` не редиректит на логин.
  useEffect(() => {
    void warmAppShellOnceOnline();
  }, []);

  // Approach C: ридер переехал на /dashboard/read (без сегмента /read/<...>/).
  const isReaderPage = pathname.startsWith('/dashboard/read');
  // When the docked bottom nav is shown, reserve space so scrollable content
  // isn't hidden behind it (single source of clearance — see .pb-nav / --dock-nav-h).
  const showBottomNav = !isReaderPage && !hideBottomNav;

  return (
    <div data-dashboard-layout className="flex flex-col h-dvh min-h-0 bg-app-bg text-app-text font-sans overflow-hidden">
      <main
        data-dashboard-layout-main
        className={`relative flex min-h-0 w-full flex-1 flex-col overflow-hidden${showBottomNav ? ' pb-nav' : ''}`}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-md flex-1 flex-col bg-app-bg md:shadow-xl">
          {children}
        </div>
      </main>

      {showBottomNav && (
        <BottomNavBar onChangeView={onChangeView} />
      )}
    </div>
  );
};

export default DashboardLayout;
