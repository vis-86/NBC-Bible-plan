'use client';

import { useEffect, useState } from 'react';
import { WifiOff, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Двухступенчатый неблокирующий индикатор офлайн-статуса.
 *
 * UX (по фидбеку: сообщение не должно навязчиво повторяться):
 * 1. Онлайн — ничего не рендерим.
 * 2. Первый переход в офлайн за сессию — полный баннер с пояснением и крестиком.
 * 3. После закрытия баннера (или при повторных переходах в офлайн в той же
 *    сессии) — компактный серый пилл «Офлайн» без крестика. Пилл висит всё
 *    время офлайна и исчезает сам при восстановлении сети.
 *
 * «Один раз за сессию» хранится в sessionStorage: переживает ремаунты
 * компонента при клиентской навигации, но сбрасывается при новом запуске
 * приложения.
 */

type IndicatorMode = 'banner' | 'pill';

const BANNER_SHOWN_KEY = 'offline-banner-shown';

function wasBannerShownThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(BANNER_SHOWN_KEY) === '1';
  } catch {
    // sessionStorage недоступен (private mode / storage disabled) —
    // деградируем к показу баннера; повторный показ хуже, чем его отсутствие.
    return false;
  }
}

function markBannerShownThisSession(): void {
  try {
    window.sessionStorage.setItem(BANNER_SHOWN_KEY, '1');
  } catch {
    // Не смогли запомнить — не критично, см. wasBannerShownThisSession.
  }
}

export function OfflineIndicator() {
  // Намеренно НЕ читаем navigator.onLine в initializer useState: на SSR (Next.js/Node)
  // существует глобальный `navigator`-стаб БЕЗ поля `onLine` — `!undefined` даёт `true`,
  // и сервер рендерит баннер даже когда никто не офлайн (воспроизводится через curl —
  // баннер есть в сыром SSR HTML). Проверка navigator.onLine — только внутри эффекта,
  // который на сервере не выполняется.
  const [isOffline, setIsOffline] = useState(false);
  const [mode, setMode] = useState<IndicatorMode>('banner');
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    const goOffline = () => {
      if (wasBannerShownThisSession()) {
        setMode('pill');
      } else {
        setMode('banner');
        markBannerShownThisSession();
      }
      setIsOffline(true);
    };

    if (!navigator.onLine) goOffline();

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => goOffline();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  // x: '-50%' — центрирование через transform самого motion (нельзя мешать Tailwind
  // `-translate-x-1/2` с motion `y`: motion перезапишет весь transform).
  const motionProps = {
    initial: reduceMotion ? { opacity: 0, x: '-50%' } : { opacity: 0, x: '-50%', y: -16 },
    animate: reduceMotion ? { opacity: 1, x: '-50%' } : { opacity: 1, x: '-50%', y: 0 },
    transition: { duration: 0.2, ease: 'easeOut' as const },
  };

  if (mode === 'pill') {
    return (
      <motion.div
        data-offline-indicator
        data-offline-indicator-pill
        role="status"
        {...motionProps}
        className="fixed left-1/2 top-0 z-[90] flex items-center gap-1.5 rounded-b-lg bg-app-text-muted px-3 py-1 text-xs font-medium text-app-text-inverse shadow-app-sm"
        style={{ paddingTop: 'max(0.25rem, env(safe-area-inset-top))' }}
      >
        <WifiOff size={12} aria-hidden />
        Офлайн
      </motion.div>
    );
  }

  return (
    <motion.div
      data-offline-indicator
      data-offline-indicator-banner
      role="status"
      {...motionProps}
      className="fixed left-1/2 top-0 z-[90] flex w-max max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-b-xl bg-app-text-secondary py-2 pl-4 pr-2 text-sm font-medium text-app-text-inverse shadow-app-lg"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <span className="flex items-center gap-2">
        <WifiOff size={18} className="shrink-0" aria-hidden />
        Офлайн — изменения синхронизируются при подключении
      </span>
      <button
        type="button"
        onClick={() => setMode('pill')}
        aria-label="Скрыть уведомление"
        className="-my-1 shrink-0 rounded-lg p-1.5 opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-text-inverse"
      >
        <X size={16} aria-hidden />
      </button>
    </motion.div>
  );
}
