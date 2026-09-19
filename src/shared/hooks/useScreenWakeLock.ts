'use client';

import { useEffect } from 'react';

/**
 * Держит экран включённым, пока смонтирован вызывающий экран (Screen Wake Lock API).
 * Подключён только к просмотру песни (`app/dashboard/song/page.tsx`, он же экран песни
 * из сета): на служении планшет с аккордами гаснуть не должен, а на остальных экранах
 * держать подсветку — лишний расход батареи.
 *
 * Браузер сам снимает lock, когда вкладка уходит в фон, поэтому он запрашивается
 * заново на возврате (`visibilitychange`). Запрос может отклониться (энергосбережение,
 * старый iOS-PWA, требование user activation в Safari) — тогда повторяем на ближайшем
 * касании. Нет API — no-op: экран просто гаснет по системному таймеру, как раньше.
 */
export function useScreenWakeLock(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let disposed = false;

    const acquire = async () => {
      if (pending || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (disposed) {
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
      } catch {
        // Отказ не фатален: следующая попытка — на касании или возврате во вкладку.
      } finally {
        pending = false;
      }
    };

    const handleVisibility = () => void acquire();
    const handlePointer = () => void acquire();

    void acquire();
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('pointerdown', handlePointer, { passive: true });
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('pointerdown', handlePointer);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };
  }, []);
}
