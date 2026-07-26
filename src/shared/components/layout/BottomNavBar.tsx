'use client';

import React, { Suspense, useEffect, useRef } from 'react';
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
  const { chromeHidden } = useChromeVisibility();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    console.debug('[BottomNavBar] chromeHidden', chromeHidden);
  }, [chromeHidden]);

  // [FIX] Корень бага «карточка песни обрезана навигацией»: `.pb-nav`
  // (клиренс контента) резервировал статичную оценку `--dock-nav-h` (56px),
  // а реальная высота бара (иконка + подпись + внутренние паддинги +
  // safe-area) на практике больше и варьируется по устройствам/масштабу
  // шрифта — отсюда и «иногда бар больше, чем нужно» (на самом деле оценка
  // всегда была занижена, просто с разным разрывом). Меряем РЕАЛЬНУЮ высоту
  // `<nav>` через ResizeObserver и пишем её в CSS-переменную
  // `--dock-nav-actual-h` на :root — `.pb-nav` (globals.css) берёт клиренс
  // из неё, так что резерв места всегда синхронен с фактическим баром, а не
  // с оценкой на глаз. Дополнительно логируем аномально большую высоту —
  // если после этого фикса бар всё ещё раздувается сильнее разумного, лог
  // даст конкретные цифры для дальнейшей диагностики.
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const root = document.documentElement;
    const fallbackHeight = parseFloat(getComputedStyle(root).getPropertyValue('--dock-nav-h')) || 56;

    const observer = new ResizeObserver(() => {
      // getBoundingClientRect (border-box: паддинги + border), а не
      // entries[0].contentRect — тот по умолчанию считает content-box и
      // занизил бы высоту ещё сильнее, чем изначальная статичная оценка.
      const height = el.getBoundingClientRect().height;

      root.style.setProperty('--dock-nav-actual-h', `${height}px`);

      // Запас над --dock-nav-h под нормальные pt-1.5 + safe-area-bottom паддинги.
      if (height > fallbackHeight + 48) {
        const style = getComputedStyle(el);
        console.warn('[FIX] BottomNavBar unexpectedly tall', {
          height,
          fallbackHeight,
          innerWidth: window.innerWidth,
          resolvedPaddingBottom: style.paddingBottom,
          resolvedPaddingTop: style.paddingTop,
        });
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--dock-nav-actual-h');
    };
  }, []);

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
    { id: 'home', icon: Home, label: 'Главная', href: '/dashboard', isFilled: true },
    { id: 'bible', icon: BookOpen, label: 'Библия', href: '/dashboard/read?book=Бытие&chapter=1' },
    { id: 'songs', icon: Music, label: 'Песни', href: '/dashboard/songs' },
    { id: 'setlists', icon: ListMusic, label: 'Сеты', href: '/dashboard/setlists' },
    ...(aiEnabled
      ? [{ id: 'chat', icon: MessageCircle, label: 'Пастырь', view: AppView.CHAT } as NavItem]
      : []),
    { id: 'settings', icon: User, label: 'Профиль', href: '/dashboard/settings' },
  ];

  return (
    <nav
      ref={navRef}
      data-dashboard-layout-bottom-nav
      data-dashboard-layout-bottom-nav-hidden={chromeHidden || undefined}
      className={`fixed bottom-0 left-0 right-0 app-shell-width min-h-[var(--dock-nav-h)] pt-1.5 glass-nav rounded-t-[24px] flex items-center justify-around z-50 border-t border-app-border dock-nav-safe-b dock-nav-safe-x transition-transform duration-300 ${
        chromeHidden ? 'translate-y-[110%] pointer-events-none' : 'translate-y-0'
      }`}
      aria-label="Основная навигация"
    >
      {navItems.map((item) => {
        const isActive = getIsActive(item);
        const Icon = item.icon;
        // `flex-1 max-w-16` вместо фиксированной `w-16`: с «Сетами» пунктов становится 6
        // (при включённом AI), и 6×64px не помещаются в 360px — пункты ужимаются вместо
        // переполнения бара.
        return (
          <button
            key={item.id}
            data-dashboard-nav-item={item.id}
            data-dashboard-nav-item-active={isActive || undefined}
            onClick={() => handleNav(item)}
            className="flex min-h-11 flex-col items-center justify-center gap-1 p-1.5 flex-1 max-w-16 relative group transition-transform duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary rounded-app-sm"
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
              className={`text-[10px] relative whitespace-nowrap ${isActive ? 'font-bold text-app-primary' : 'font-medium text-app-text-muted group-hover:text-app-text-secondary'}`}
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
