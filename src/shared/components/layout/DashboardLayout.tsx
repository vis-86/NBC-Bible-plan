'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppView } from '@/types';
import BottomNavBar from './BottomNavBar';
import { ChromeVisibilityProvider } from './ChromeVisibility';
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
  // Immersive-ридер: nav теперь виден и в ридере (overlay, скрывается по скроллу —
  // см. ChromeVisibility), поэтому showBottomNav больше не исключает isReaderPage.
  const isReaderPage = pathname.startsWith('/dashboard/read');
  const showBottomNav = !hideBottomNav;
  // На ридере nav — overlay поверх контента (плавающая навигация ридера и
  // собственный bottom-padding контента дают клиренс), не резервируем под него
  // место в layout — иначе скрытие/показ nav дёргает высоту контента.
  const reserveNavSpace = showBottomNav && !isReaderPage;

  return (
    <ChromeVisibilityProvider>
      <div data-dashboard-layout className="flex flex-col h-dvh min-h-0 bg-app-bg text-app-text font-sans overflow-hidden">
        <main
          data-dashboard-layout-main
          className={`relative flex min-h-0 w-full flex-1 flex-col overflow-hidden${reserveNavSpace ? ' pb-nav' : ''}`}
        >
          <div className="mx-auto flex h-full min-h-0 w-full max-w-md flex-1 flex-col bg-app-bg md:shadow-xl">
            {children}
          </div>
        </main>

        {showBottomNav && (
          <BottomNavBar onChangeView={onChangeView} />
        )}
      </div>
    </ChromeVisibilityProvider>
  );
};

export default DashboardLayout;
