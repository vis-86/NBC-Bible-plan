'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Небольшой неблокирующий индикатор офлайн-статуса.
 *
 * До фикса SW при потере сети возвращал голый текст "Offline" вместо HTML —
 * приложение вообще не грузилось (см. patch в .ai-factory/patches/). Теперь SW
 * кеширует посещённые страницы и отдаёт реальный app shell офлайн, поэтому
 * этот баннер — просто индикатор статуса, он НЕ блокирует работу с приложением.
 */
export function OfflineIndicator() {
  // Намеренно НЕ читаем navigator.onLine в initializer useState: на SSR (Next.js/Node)
  // существует глобальный `navigator`-стаб БЕЗ поля `onLine` — `!undefined` даёт `true`,
  // и сервер рендерит баннер даже когда никто не офлайн (воспроизводится через curl —
  // баннер есть в сыром SSR HTML). Проверка navigator.onLine — только внутри эффекта,
  // который на сервере не выполняется.
  const [isOffline, setIsOffline] = useState(false);

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
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      data-offline-indicator
      role="status"
      className="fixed left-1/2 top-0 z-[90] -translate-x-1/2 rounded-b-lg bg-app-text-secondary px-3 py-1 text-xs font-medium text-app-text-inverse shadow-app-lg"
      style={{ paddingTop: 'max(0.25rem, env(safe-area-inset-top))' }}
    >
      <span className="flex items-center gap-1.5">
        <WifiOff size={12} aria-hidden />
        Офлайн — изменения синхронизируются при подключении
      </span>
    </div>
  );
}
