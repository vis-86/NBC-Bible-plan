'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppView } from '@/types';
import BottomNavBar from './BottomNavBar';
import { ChromeVisibilityProvider, useChromeVisibility } from './ChromeVisibility';
import { warmAppShellOnceOnline } from '@/shared/offline/appShell';
import { useAppViewportHeight } from '@/shared/hooks/useAppViewportHeight';
import { AppShellNodeContext } from './AppShellNode';
import { cn } from '@/shared/utils/cn';

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentView?: AppView;
  onChangeView?: (view: AppView) => void;
  hideBottomNav?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, onChangeView, hideBottomNav = false }) => {
  const pathname = usePathname();
  // Узел оболочки отдаётся вниз через контекст: оверлеи, которые рендерятся
  // порталом, обязаны попадать внутрь него, иначе они снова окажутся привязаны
  // к вьюпорту (см. AppShellNode).
  const [shellNode, setShellNode] = useState<HTMLElement | null>(null);

  // Высота оболочки — измеренный вьюпорт, а не `100dvh` (см. хук): на iOS
  // после поворота экрана layout viewport залипает смещённым, и низ оболочки
  // вместе с докнутой навигацией не достаёт до края экрана.
  useAppViewportHeight();

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
      <div
        ref={setShellNode}
        data-dashboard-layout
        className="relative flex flex-col h-app-viewport min-h-0 bg-app-bg text-app-text font-sans overflow-hidden"
      >
        <AppShellNodeContext.Provider value={shellNode}>
          <DashboardMain reserveNavSpace={reserveNavSpace}>{children}</DashboardMain>

          {showBottomNav && (
            <BottomNavBar onChangeView={onChangeView} />
          )}
        </AppShellNodeContext.Provider>
      </div>
    </ChromeVisibilityProvider>
  );
};

interface DashboardMainProps {
  reserveNavSpace: boolean;
  children: React.ReactNode;
}

/**
 * Резерв места под докнутый nav (`.pb-nav`) должен исчезать синхронно со
 * скрытием бара по скроллу (`chromeHidden`) — иначе на страницах вроде
 * списка песен, где nav и резервируется, и прячется по скроллу, внизу
 * остаётся статичный пустой блок высотой бара, когда сам бар уже уехал вниз.
 * Вынесено в отдельный компонент: `useChromeVisibility` требует контекст,
 * который создаёт `ChromeVisibilityProvider` выше по дереву — вызов хука
 * прямо в `DashboardLayout` упал бы (провайдера ещё нет в момент рендера).
 */
function DashboardMain({ reserveNavSpace, children }: DashboardMainProps) {
  const { chromeHidden } = useChromeVisibility();
  const showReserve = reserveNavSpace && !chromeHidden;

  return (
    <main
      data-dashboard-layout-main
      className={cn(
        'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden transition-[padding-bottom] duration-300',
        showReserve && 'pb-nav'
      )}
    >
      {/* Ширина оболочки — одна переменная на контент и на докнутый nav (.app-shell-width). */}
      <div className="app-shell-width flex h-full min-h-0 flex-1 flex-col bg-app-bg md:shadow-xl">
        {children}
      </div>
    </main>
  );
}

export default DashboardLayout;
