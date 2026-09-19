'use client';

import React, { useEffect, useState } from 'react';
import { AppView } from '@/types';
import BottomNavBar from './BottomNavBar';
import { ChromeVisibilityProvider } from './ChromeVisibility';
import { warmAppShellOnceOnline } from '@/shared/offline/appShell';
import { useAppViewportHeight } from '@/shared/hooks/useAppViewportHeight';
import { AppShellNodeContext } from './AppShellNode';

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentView?: AppView;
  onChangeView?: (view: AppView) => void;
  hideBottomNav?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, onChangeView, hideBottomNav = false }) => {
  // Узел оболочки отдаётся вниз через контекст: оверлеи, которые рендерятся
  // порталом, обязаны попадать внутрь него (см. AppShellNode).
  const [shellNode, setShellNode] = useState<HTMLElement | null>(null);

  // Высоту оболочки держит CSS (`.h-app-viewport` = fixed;inset:0, см. globals.css).
  // Хук лишь синхронизирует `--app-vh` (visualViewport) для шитов/панелей, которые
  // жмутся под клавиатуру iOS (BottomSheet, AddSongsSheet, SetlistReorderList).
  useAppViewportHeight();

  // Прогрев app-shell документов в HTML-кеш SW при онлайн-загрузке приложения
  // (один раз за сессию). Даёт офлайн-навигацию к маршрутам, куда ходят клиентским
  // push (песни/Библия/календарь) — иначе офлайн они падают в 503-заглушку.
  // DashboardLayout рендерится только для аутентифицированных дашборд-страниц —
  // значит контекст всегда залогинен, `/dashboard/*` не редиректит на логин.
  useEffect(() => {
    void warmAppShellOnceOnline();
  }, []);

  const showBottomNav = !hideBottomNav;

  return (
    <ChromeVisibilityProvider>
      <div
        ref={setShellNode}
        data-dashboard-layout
        className="flex flex-col h-app-viewport min-h-0 bg-app-bg text-app-text font-sans overflow-hidden"
      >
        <AppShellNodeContext.Provider value={shellNode}>
          <DashboardMain>{children}</DashboardMain>

          {showBottomNav && (
            <BottomNavBar onChangeView={onChangeView} />
          )}
        </AppShellNodeContext.Provider>
      </div>
    </ChromeVisibilityProvider>
  );
};

/**
 * Клиренс под плавающий бар НЕ резервируется здесь: бар — `position: fixed` и
 * парит над контентом, поэтому каждый экран-скроллер сам даёт себе нижний
 * `.pb-nav` (headroom внутри прокрутки), а контент проходит ПОД полупрозрачным
 * баром. Так бар именно парит, а не выглядит футером с полосой под ним.
 */
function DashboardMain({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-dashboard-layout-main
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
    >
      <div className="app-shell-width flex h-full min-h-0 flex-1 flex-col bg-app-bg md:shadow-xl">
        {children}
      </div>
    </main>
  );
}

export default DashboardLayout;
