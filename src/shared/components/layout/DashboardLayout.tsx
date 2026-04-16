'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Home, BookMarked, User } from 'lucide-react';
import { AppView } from '@/types';
import { isAIEnabled } from '@/shared/utils/constants';
import { MessageCircle } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentView: AppView;
  onChangeView: (view: AppView) => void;
  hideBottomNav?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, currentView, onChangeView, hideBottomNav = false }) => {
  const router = useRouter();
  const aiEnabled = isAIEnabled();

  const navItems: Array<{
    view: AppView;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    label: string;
    isHome?: boolean;
    isSettings?: boolean;
    isFilled?: boolean;
  }> = [
    { view: AppView.PLAN, icon: Home, label: 'Главная', isHome: true, isFilled: true },
    { view: AppView.READER, icon: BookOpen, label: 'Библия' },
    aiEnabled
      ? { view: AppView.CHAT, icon: MessageCircle, label: 'Пастырь' }
      : { view: AppView.PLAN, icon: BookMarked, label: 'Закладки' },
    { view: AppView.SETTINGS, icon: User, label: 'Профиль', isSettings: true },
  ].filter(Boolean) as Array<{
    view: AppView;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    label: string;
    isHome?: boolean;
    isSettings?: boolean;
    isFilled?: boolean;
  }>;

  const handleNav = (item: (typeof navItems)[0]) => {
    if (item.isHome) router.push('/dashboard');
    else if (item.isSettings) router.push('/dashboard/settings');
    else if (item.view === AppView.READER) onChangeView(AppView.READER);
    else onChangeView(item.view);
  };

  return (
    <div data-dashboard-layout className="flex flex-col h-screen bg-app-bg text-app-text font-sans overflow-hidden">
      <main data-dashboard-layout-main className="flex-1 overflow-hidden relative w-full">
        <div className="max-w-md mx-auto h-full bg-app-bg md:shadow-xl">
          {children}
        </div>
      </main>

      {currentView !== AppView.READER && !hideBottomNav && (
        <nav
          data-dashboard-layout-bottom-nav
          className="fixed bottom-6 left-4 right-4 max-w-md mx-auto h-[72px] glass-nav rounded-[24px] flex items-center justify-around px-2 z-50 border border-app-border shadow-2xl safe-area-bottom"
          aria-label="Основная навигация"
        >
          {navItems.map((item) => {
            const isActive = currentView === item.view || (item.isHome && currentView === AppView.PLAN);
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                data-dashboard-nav-item={item.view}
                data-dashboard-nav-item-active={isActive || undefined}
                onClick={() => handleNav(item)}
                className="flex flex-col items-center gap-1 p-2 w-16 relative group transition-transform active:scale-90"
                aria-current={isActive ? 'page' : undefined}
              >
                <span
                  className={`absolute -top-3 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transition-opacity ${isActive ? 'bg-app-primary opacity-100' : 'bg-app-text-muted opacity-0 group-hover:opacity-0'}`}
                  aria-hidden
                />
                <div
                  data-dashboard-nav-item-icon={item.view}
                  className={isActive ? 'text-app-primary' : 'text-app-text-muted group-hover:text-app-text-secondary transition-colors'}
                >
                  <Icon size={24} className={isActive && item.isFilled ? 'fill-current' : ''} />
                </div>
                <span
                  data-dashboard-nav-item-label={item.view}
                  className={`text-[10px] ${isActive ? 'font-bold text-app-primary' : 'font-medium text-app-text-muted group-hover:text-app-text-secondary'}`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
};

export default DashboardLayout;
