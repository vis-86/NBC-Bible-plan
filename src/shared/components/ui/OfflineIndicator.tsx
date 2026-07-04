'use client';

import { useEffect, useState } from 'react';
import { WifiOff, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Небольшой неблокирующий индикатор офлайн-статуса.
 *
 * До фикса SW при потере сети возвращал голый текст "Offline" вместо HTML —
 * приложение вообще не грузилось (см. patch в .ai-factory/patches/). Теперь SW
 * кеширует посещённые (реальной навигацией) страницы и отдаёт их реальный HTML
 * офлайн; для непосещённых — статическую офлайн-заглушку без reload-цикла (см.
 * OFFLINE_FALLBACK_HTML в src/sw/sw-source.ts). Этот баннер — просто индикатор
 * статуса, он НЕ блокирует работу с приложением.
 *
 * UX: плавно въезжает сверху, его можно закрыть крестиком (баннер не должен
 * навязчиво висеть, пока пользователь читает офлайн). Закрытие — только для
 * текущей потери сети: новый переход в офлайн снова показывает баннер.
 */
export function OfflineIndicator() {
  // Намеренно НЕ читаем navigator.onLine в initializer useState: на SSR (Next.js/Node)
  // существует глобальный `navigator`-стаб БЕЗ поля `onLine` — `!undefined` даёт `true`,
  // и сервер рендерит баннер даже когда никто не офлайн (воспроизводится через curl —
  // баннер есть в сыром SSR HTML). Проверка navigator.onLine — только внутри эффекта,
  // который на сервере не выполняется.
  const [isOffline, setIsOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setIsOffline(!navigator.onLine);

    const handleOnline = () => {
      console.debug('[FIX][OfflineIndicator] online');
      setIsOffline(false);
    };
    const handleOffline = () => {
      console.debug('[FIX][OfflineIndicator] offline');
      setIsOffline(true);
      // Новый переход в офлайн — показываем баннер снова, даже если его закрыли
      // при прошлой потере сети.
      setDismissed(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline || dismissed) return null;

  // x: '-50%' — центрирование через transform самого motion (нельзя мешать Tailwind
  // `-translate-x-1/2` с motion `y`: motion перезапишет весь transform).
  return (
    <motion.div
      data-offline-indicator
      role="status"
      initial={reduceMotion ? { opacity: 0, x: '-50%' } : { opacity: 0, x: '-50%', y: -16 }}
      animate={reduceMotion ? { opacity: 1, x: '-50%' } : { opacity: 1, x: '-50%', y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed left-1/2 top-0 z-[90] flex items-center gap-2 rounded-b-lg bg-app-text-secondary py-1 pl-3 pr-1.5 text-xs font-medium text-app-text-inverse shadow-app-lg"
      style={{ paddingTop: 'max(0.25rem, env(safe-area-inset-top))' }}
    >
      <span className="flex items-center gap-1.5">
        <WifiOff size={12} aria-hidden />
        Офлайн — изменения синхронизируются при подключении
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Скрыть уведомление"
        className="-my-0.5 shrink-0 rounded p-0.5 opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-text-inverse"
      >
        <X size={12} aria-hidden />
      </button>
    </motion.div>
  );
}
