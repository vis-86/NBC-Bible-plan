'use client';

import { PULL_VAR, usePullToRefresh } from '@/shared/hooks/usePullToRefresh';
import { cn } from '@/shared/utils/cn';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';

/**
 * Скролл-контейнер с жестом «потянуть вниз → обновить».
 *
 * Владеет скроллом сам: `overscroll-y-contain` обязателен, иначе на Chrome Android
 * поверх нашего индикатора поедет ещё и нативный pull-to-refresh браузера.
 */

export interface PullToRefreshProps {
  /** false — жест выключен (например, поверх открыта шторка со своим скроллом). */
  enabled?: boolean;
  /** Должен сам обрабатывать свои ошибки: жест только ждёт завершения, чтобы убрать спиннер. */
  onRefresh: () => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}

export function PullToRefresh({ enabled = true, onRefresh, className, children }: PullToRefreshProps) {
  const { scrollRef, handlers, phase } = usePullToRefresh({ enabled, onRefresh });

  return (
    <div
      ref={scrollRef}
      data-pull-to-refresh
      data-pull-to-refresh-phase={phase}
      className={cn(
        'relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain',
        // Мышью протягивание выделяло бы текст карточек; на тач-жест это не влияет.
        phase !== 'idle' && 'select-none',
        className
      )}
      {...handlers}
    >
      <PullToRefreshIndicator phase={phase} />
      {/* Контент едет за пальцем — иначе индикатор наезжает на первую карточку.
          Transform, а не отступ: layout списка не пересчитывается. */}
      <div style={{ transform: `translateY(var(${PULL_VAR}, 0px))` }}>{children}</div>
    </div>
  );
}
