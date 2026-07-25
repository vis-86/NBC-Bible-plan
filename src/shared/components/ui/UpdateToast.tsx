'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useSwUpdate } from '@/shared/hooks/useSwUpdate';

/**
 * Тост «Доступна новая версия» — показывается, когда ServiceWorkerRegistrar
 * находит waiting SW новой версии (см. useSwUpdate). Позиционируется НАД
 * BottomNavBar (z-50, высота var(--dock-nav-h)) через тот же safe-area отступ.
 *
 * «Позже» скрывает тост до конца сессии компонента (не персистится — новый
 * updateReady в этой же вкладке всё равно один и тот же waiting-воркер).
 */
export function UpdateToast() {
  const { updateReady, applyUpdate } = useSwUpdate();
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();

  if (!updateReady || dismissed || pathname === '/') return null;

  const handleApply = () => {
    console.debug('[UpdateToast] apply clicked');
    setApplying(true);
    applyUpdate();
  };

  const handleDismiss = () => {
    console.debug('[UpdateToast] dismissed');
    setDismissed(true);
  };

  const motionProps = {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 },
    animate: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
    transition: { duration: 0.2, ease: 'easeOut' as const },
  };

  console.debug('[UpdateToast] shown');

  return (
    <motion.div
      data-update-toast
      role="status"
      {...motionProps}
      className="fixed inset-x-0 z-[60] app-shell-width flex items-center justify-between gap-3 px-4"
      style={{ bottom: 'calc(var(--dock-nav-h) + env(safe-area-inset-bottom) + 12px)' }}
    >
      <div
        data-update-toast-panel
        className="flex w-full items-center gap-3 rounded-2xl bg-app-text-secondary px-4 py-3 text-sm font-medium text-app-text-inverse shadow-app-lg"
      >
        <RefreshCw size={18} className="shrink-0" aria-hidden />
        <span className="flex-1">Доступна новая версия</span>
        <button
          type="button"
          data-update-toast-dismiss
          onClick={handleDismiss}
          disabled={applying}
          className="shrink-0 rounded-lg px-2 py-1.5 opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-text-inverse disabled:opacity-40"
        >
          Позже
        </button>
        <button
          type="button"
          data-update-toast-apply
          onClick={handleApply}
          disabled={applying}
          className="shrink-0 rounded-lg bg-app-text-inverse px-3 py-1.5 text-app-text-secondary transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-text-inverse disabled:opacity-60"
        >
          {applying ? 'Обновление…' : 'Обновить'}
        </button>
      </div>
    </motion.div>
  );
}
