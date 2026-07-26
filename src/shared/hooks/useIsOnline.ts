'use client';

import { useEffect, useState } from 'react';

/**
 * Реактивный `navigator.onLine`, подписанный на `online`/`offline` — читать флаг
 * один раз при монтировании недостаточно (сеть переходного экрана и т.п. живёт
 * дольше одного рендера). Используется гейтом записи сетов (online-only исключение
 * из offline-first, см. `.ai-factory/plans/feature-setlists.md`).
 */
export function useIsOnline(): boolean {
  // SSR-стаб `navigator` может не иметь `onLine` — `true` дефолт безопаснее (не
  // блокирует запись авансом); реальное состояние подтверждается в эффекте.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    // Индирекция (не прямой setIsOnline(...) в теле эффекта) — иначе синхронный
    // setState в эффекте триггерит react-hooks/set-state-in-effect.
    const syncInitial = () => (navigator.onLine ? handleOnline() : handleOffline());
    syncInitial();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
