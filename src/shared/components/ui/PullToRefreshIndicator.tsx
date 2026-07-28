'use client';

import { Loader2 } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { PROGRESS_VAR, PULL_VAR, type PullToRefreshPhase } from '@/shared/hooks/usePullToRefresh';
import { cn } from '@/shared/utils/cn';

/**
 * Индикатор pull-to-refresh: таблетка со стрелкой-спиннером над списком.
 *
 * `LoadingSpinner` намеренно НЕ переиспользуется: он хардкодит `animate-spin`, а в фазе
 * `pulling` иконка обязана доворачиваться пальцем, а не крутиться сама. Берём `Loader2`
 * напрямую.
 *
 * Живое положение приходит CSS-переменными от `usePullToRefresh` (`--ptr-pull`,
 * `--ptr-progress`) — без ререндера списка на каждый `pointermove`.
 */

export interface PullToRefreshIndicatorProps {
  phase: PullToRefreshPhase;
}

/** Полный доворот иконки к моменту взвода. Считается от прогресса: `deg × unitless` — валидный calc. */
const ARM_ROTATION_DEG = 180;

export function PullToRefreshIndicator({ phase }: PullToRefreshIndicatorProps) {
  const reduceMotion = useReducedMotion();
  const refreshing = phase === 'refreshing';

  return (
    <div
      data-pull-to-refresh-indicator
      data-pull-to-refresh-phase={phase}
      aria-hidden={phase === 'idle'}
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      style={{
        // Таблетка едет вниз вместе с пальцем и не влияет на layout списка.
        transform: `translateY(calc(var(${PULL_VAR}, 0px) - 100%))`,
        opacity: `var(${PROGRESS_VAR}, 0)`,
      }}
    >
      <div
        className={cn(
          'mt-2 rounded-full border border-app-border bg-app-surface-elevated p-2 shadow-app-md transition-colors',
          phase === 'armed' ? 'text-app-primary' : 'text-app-text-secondary'
        )}
        style={reduceMotion ? undefined : { scale: `calc(0.6 + 0.4 * var(${PROGRESS_VAR}, 0))` }}
      >
        <Loader2
          size={20}
          className={refreshing && !reduceMotion ? 'animate-spin' : undefined}
          style={
            refreshing || reduceMotion
              ? undefined
              : // Пока тянут — иконка доворачивается пальцем.
                { transform: `rotate(calc(var(${PROGRESS_VAR}, 0) * ${ARM_ROTATION_DEG}deg))` }
          }
        />
      </div>
    </div>
  );
}
