'use client';

import { ChevronLeft, ChevronRight, ListMusic } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface SetlistPagerDockProps {
  index: number; // 0-based
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Тап по центру — открыть SetlistManageSheet. */
  onOpenSetlist: () => void;
  /** Скрыт вместе с шапкой (тот же флаг, что у PageHeader на этой странице). */
  hidden: boolean;
}

export function SetlistPagerDock({ index, total, canPrev, canNext, onPrev, onNext, onOpenSetlist, hidden }: SetlistPagerDockProps) {
  const handlePrev = () => {
    console.debug('[SetlistPagerDock] nav', { direction: 'prev', index, total });
    onPrev();
  };
  const handleNext = () => {
    console.debug('[SetlistPagerDock] nav', { direction: 'next', index, total });
    onNext();
  };

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 pb-safe">
      <div
        data-setlist-pager-dock
        className={cn(
          'pointer-events-auto flex items-center gap-1 rounded-full bg-app-surface/90 shadow-app-card backdrop-blur-md transition-[transform,opacity] duration-300',
          hidden ? 'translate-y-24 opacity-0' : 'translate-y-0 opacity-100'
        )}
      >
        <button
          type="button"
          data-setlist-pager-dock-prev
          aria-label="Предыдущая песня сета"
          disabled={!canPrev}
          onClick={handlePrev}
          className="flex h-11 w-11 items-center justify-center rounded-full text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          data-setlist-pager-dock-counter
          aria-label={`Песня ${index + 1} из ${total}, открыть список сета`}
          onClick={onOpenSetlist}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold text-app-primary transition-transform duration-150 active:scale-95"
        >
          <ListMusic size={16} aria-hidden />
          {index + 1} / {total}
        </button>
        <button
          type="button"
          data-setlist-pager-dock-next
          aria-label="Следующая песня сета"
          disabled={!canNext}
          onClick={handleNext}
          className="flex h-11 w-11 items-center justify-center rounded-full text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
