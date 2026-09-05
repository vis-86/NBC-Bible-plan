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
    { id: 'home', icon: Home, label: 'Главная', href: '/dashboard', isFilled: true },
    { id: 'bible', icon: BookOpen, label: 'Библия', href: '/dashboard/read?book=Бытие&chapter=1' },
    { id: 'songs', icon: Music, label: 'Песни', href: '/dashboard/songs' },
    { id: 'setlists', icon: ListMusic, label: 'Сеты', href: '/dashboard/setlists' },
    ...(aiEnabled
      ? [{ id: 'chat', icon: MessageCircle, label: 'Пастырь', view: AppView.CHAT } as NavItem]
      : []),
    { id: 'settings', icon: User, label: 'Профиль', href: '/dashboard/settings' },
  ];

  // Плавающий бар (по мотивам YouVersion): почти во всю доступную ширину (с
  // боковыми полями), приподнят над низом на safe-area + `--dock-nav-gap`, пункты
  // растянуты `flex-1`. НЕ приклеен флешем к точному низу оболочки — боковые и
  // нижний отступы делают его терпимым к джиттеру измеренной высоты вьюпорта на
  // iOS (после поворота/пинча): бар просто плавает над контентом, а не рисует
  // пустую полосу снизу. Остаётся внутри оболочки (`absolute`, оболочка —
  // containing block), а не порталится в body: чистый `fixed` к вьюпорту iOS как
  // раз и был исходной болью (см. useAppViewportHeight). Центрирование и скрытие
  // по скроллу — оба через один transform (Tailwind склеивает translate-x/y).
  return (
    <nav
      data-dashboard-layout-bottom-nav
      data-dashboard-layout-bottom-nav-hidden={chromeHidden || undefined}
      className={`absolute left-1/2 bottom-[calc(env(safe-area-inset-bottom)+var(--dock-nav-gap))] z-50 flex w-[calc(100%-1.5rem)] max-w-[32rem] items-stretch gap-1 rounded-3xl border border-app-border glass-nav backdrop-blur-xl backdrop-saturate-150 px-1.5 py-1.5 shadow-app-md transition-transform duration-300 ${
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
            className="group flex min-h-12 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1 transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary rounded-2xl"
            aria-current={isActive ? 'page' : undefined}
          >
            {/* Активный индикатор — «пилюля» под иконкой (Material 3 / YouVersion):
                чётко выделяет текущий раздел, не перекрашивая весь пункт. */}
            <span
              data-dashboard-nav-item-icon={item.id}
              className={`flex h-8 w-full max-w-14 items-center justify-center rounded-full transition-colors ${
                isActive
                  ? 'bg-app-primary-light text-app-primary'
                  : 'text-app-text-secondary group-hover:text-app-text'
              }`}
            >
              <Icon size={25} className={isActive && item.isFilled ? 'fill-current' : ''} />
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
