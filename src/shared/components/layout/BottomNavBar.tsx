'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { BookOpen, Home, User, MessageCircle, Music, ListMusic } from 'lucide-react';
import { AppView } from '@/types';
import { isAIEnabled } from '@/shared/utils/constants';
import { bibleTabHref } from '@/features/reading/last-read-location';
import { useChromeVisibility } from './ChromeVisibility';

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  href?: string;
  view?: AppView;
}

interface BottomNavBarProps {
  onChangeView?: (view: AppView) => void;
}

function BottomNavBarInner({ onChangeView }: BottomNavBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const aiEnabled = isAIEnabled();
  const { chromeHidden } = useChromeVisibility();

  useEffect(() => {
    console.debug('[BottomNavBar] chromeHidden', chromeHidden);
  }, [chromeHidden]);

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
    // Все три маршрута сетов (`/setlists`, `/setlist`, `/setlist-edit`) — один префикс.
    // С `/dashboard/song(s)` он не пересекается, поэтому порядок веток не важен.
    if (item.id === 'setlists') {
      return pathname.startsWith('/dashboard/setlist');
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
    // Тап по уже активному пункту — no-op. Критично для «Библии»: её href
    // жёстко указывает на Бытие 1 (`?book=Бытие&chapter=1`) — без этой проверки
    // тап по активной «Библии» из любого места ридера сбрасывал бы читаемую главу.
    if (getIsActive(item)) {
      console.debug('[BottomNavBar] noop: already active', item.id);
      return;
    }

    console.debug('[BottomNavBar] navigate', { to: item.href || item.view, from: pathname });

    if (item.id === 'chat') {
      if (pathname === '/dashboard') {
        onChangeView?.(AppView.CHAT);
      } else {
        router.push('/dashboard?view=chat');
      }
      return;
    }

    // «Библия» открывает последнее прочитанное место из localStorage
    // (фолбэк — Бытие 1). Читаем на клике, а не в navItems: значение
    // клиентское и меняется между рендерами навигации.
    if (item.id === 'bible') {
      router.push(bibleTabHref());
      return;
    }

    if (item.href) {
      router.push(item.href);
    }
  };

  const navItems: NavItem[] = [
    { id: 'home', icon: Home, label: 'Главная', href: '/dashboard' },
    { id: 'bible', icon: BookOpen, label: 'Библия', href: '/dashboard/read?book=Бытие&chapter=1' },
    { id: 'songs', icon: Music, label: 'Песни', href: '/dashboard/songs' },
    { id: 'setlists', icon: ListMusic, label: 'Сеты', href: '/dashboard/setlists' },
    ...(aiEnabled
      ? [{ id: 'chat', icon: MessageCircle, label: 'Пастырь', view: AppView.CHAT } as NavItem]
      : []),
    { id: 'settings', icon: User, label: 'Профиль', href: '/dashboard/settings' },
  ];

  // Плавающий бар (по мотивам YouVersion/chordpro): почти во всю ширину (с боковыми
  // полями), приподнят над низом на safe-area + `--dock-nav-gap`, пункты `flex-1`.
  // `position: fixed` — привязка к ВЬЮПОРТУ, а не к оболочке: на iOS высота корня
  // после поворота может «залипать» короткой, но бар всё равно у настоящего низа
  // экрана (в chordpro так же, поэтому там нет полосы снизу). Работает только без
  // transform-предка (он снят с `.h-app-viewport`) — иначе fixed считался бы от
  // оболочки. Центрирование и скрытие по скроллу — через один transform (Tailwind
  // склеивает translate-x/y).
  return (
    <nav
      data-dashboard-layout-bottom-nav
      data-dashboard-layout-bottom-nav-hidden={chromeHidden || undefined}
      className={`fixed left-1/2 bottom-[calc(env(safe-area-inset-bottom)+var(--dock-nav-gap))] z-50 flex w-[calc(100%-1.5rem)] max-w-[32rem] items-stretch gap-1 rounded-3xl border border-app-border glass-nav backdrop-blur-xl backdrop-saturate-150 px-1.5 py-1.5 shadow-app-md transition-transform duration-300 ${
        chromeHidden ? '-translate-x-1/2 translate-y-[calc(100%+env(safe-area-inset-bottom)+var(--dock-nav-gap))] pointer-events-none' : '-translate-x-1/2 translate-y-0'
      }`}
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
            className={`group flex min-h-12 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1.5 rounded-2xl transition-[transform,background-color] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary ${
              isActive ? 'bg-app-primary-light' : ''
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {/* Активный раздел подсвечивается целиком (заливка ячейки + яркие
                иконка и подпись), а не только чипом под иконкой. */}
            <span
              data-dashboard-nav-item-icon={item.id}
              className={
                isActive ? 'text-app-primary' : 'text-app-text-secondary group-hover:text-app-text transition-colors'
              }
            >
              <Icon size={25} />
            </span>
            <span
              data-dashboard-nav-item-label={item.id}
              className={`text-[11px] leading-none whitespace-nowrap transition-colors ${
                isActive ? 'font-semibold text-app-primary' : 'font-medium text-app-text-secondary group-hover:text-app-text'
              }`}
            >
              {item.label}
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
