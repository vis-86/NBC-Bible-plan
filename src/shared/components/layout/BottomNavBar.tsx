'use client';

import React, { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { BookOpen, Home, User, MessageCircle, Music } from 'lucide-react';
import { AppView } from '@/types';
import { isAIEnabled } from '@/shared/utils/constants';

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  href?: string;
  view?: AppView;
  isFilled?: boolean;
}

interface BottomNavBarProps {
  onChangeView?: (view: AppView) => void;
}

function BottomNavBarInner({ onChangeView }: BottomNavBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const aiEnabled = isAIEnabled();

  const viewParam = searchParams.get('view');

  const getIsActive = (item: NavItem): boolean => {
    if (item.id === 'home') {
      return pathname === '/dashboard' && viewParam !== 'chat';
    }
    if (item.id === 'bible') {
      return pathname.startsWith('/dashboard/read');
    }
    if (item.id === 'songs') {
      return pathname.startsWith('/dashboard/songs');
    }
    if (item.id === 'chat') {
      return pathname === '/dashboard' && viewParam === 'chat';
    }
    if (item.id === 'settings') {
      return pathname === '/dashboard/settings';
    }
    return false;
  };

  const handleNav = (item: NavItem) => {
    console.debug('[BottomNavBar] navigate', { to: item.href || item.view, from: pathname });

    if (item.id === 'chat') {
      if (pathname === '/dashboard') {
        onChangeView?.(AppView.CHAT);
      } else {
        router.push('/dashboard?view=chat');
      }
      return;
    }

    if (item.href) {
      router.push(item.href);
    }
  };

  const navItems: NavItem[] = [
    { id: 'home', icon: Home, label: 'Главная', href: '/dashboard', isFilled: true },
    { id: 'bible', icon: BookOpen, label: 'Библия', href: '/dashboard/read/Бытие/1' },
    { id: 'songs', icon: Music, label: 'Песни', href: '/dashboard/songs' },
    ...(aiEnabled
      ? [{ id: 'chat', icon: MessageCircle, label: 'Пастырь', view: AppView.CHAT } as NavItem]
      : []),
    { id: 'settings', icon: User, label: 'Профиль', href: '/dashboard/settings' },
  ];

  return (
    <nav
      data-dashboard-layout-bottom-nav
      className="fixed bottom-0 left-0 right-0 max-w-md mx-auto min-h-[64px] pt-2 glass-nav rounded-t-[24px] flex items-center justify-around z-50 border-t border-app-border dock-nav-safe-b dock-nav-safe-x"
      aria-label="Основная навигация"
    >
      {navItems.map((item) => {
        const isActive = getIsActive(item);
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            data-dashboard-nav-item={item.id}
            data-dashboard-nav-item-active={isActive || undefined}
            onClick={() => handleNav(item)}
            className="flex flex-col items-center gap-1 p-2 w-16 relative group transition-transform active:scale-90"
            aria-current={isActive ? 'page' : undefined}
          >
            <div
              data-dashboard-nav-item-icon={item.id}
              className={isActive ? 'text-app-primary' : 'text-app-text-muted group-hover:text-app-text-secondary transition-colors'}
            >
              <Icon size={24} className={isActive && item.isFilled ? 'fill-current' : ''} />
            </div>
            <span
              data-dashboard-nav-item-label={item.id}
              className={`text-[10px] relative ${isActive ? 'font-bold text-app-primary' : 'font-medium text-app-text-muted group-hover:text-app-text-secondary'}`}
            >
              {item.label}
              {isActive && (
                <span
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-app-primary"
                  aria-hidden
                />
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default function BottomNavBar(props: BottomNavBarProps) {
  return (
    <Suspense>
      <BottomNavBarInner {...props} />
    </Suspense>
  );
}
