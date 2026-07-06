'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useChromeVisibility } from '@/shared/components/layout/ChromeVisibility';

type ReaderDisplayTheme = 'light' | 'dark' | 'sepia';

interface FloatingChapterNavProps {
  /**
   * Тема РИДЕРА (не приложения) — как у ReadingHeader: `dark:`-варианты тут
   * не годятся, ридер может быть тёмным при светлом приложении (и наоборот).
   */
  displayTheme?: ReaderDisplayTheme;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  /** Чтение по плану (day != null) — на последней главе дня правая кнопка становится ✓. */
  isPlanMode: boolean;
}

/** По мотивам readerFooterTheme (ReadingPlanFooter, удаляется вместе с этим компонентом). */
export const floatingNavTheme: Record<ReaderDisplayTheme, { surface: string; cta: string }> = {
  light: {
    surface: 'bg-white/90 text-stone-500 hover:text-stone-900 shadow-[0_4px_16px_rgba(0,0,0,0.08)]',
    cta: 'bg-stone-900 text-white hover:bg-stone-800',
  },
  dark: {
    surface: 'bg-stone-800/90 text-stone-400 hover:text-stone-100 shadow-[0_4px_16px_rgba(0,0,0,0.35)]',
    cta: 'bg-stone-700 text-white hover:bg-stone-600',
  },
  sepia: {
    surface: 'bg-amber-50/90 text-stone-500 hover:text-stone-900 shadow-[0_4px_16px_rgba(0,0,0,0.06)]',
    cta: 'bg-stone-900 text-white hover:bg-stone-800',
  },
};

/**
 * Плавающие кнопки навигации по главам (YouVersion-style): слева ‹ (prev),
 * справа › (next) или ✓ (завершить день) на последней главе дня в режиме
 * плана. Видимы всегда — по скроллу меняется только bottom-offset (анимация
 * через transform, не через layout-свойство `bottom` — compositor-friendly).
 */
export const FloatingChapterNav: React.FC<FloatingChapterNavProps> = ({
  displayTheme = 'light',
  onPrev,
  onNext,
  canPrev,
  canNext,
  isPlanMode,
}) => {
  const { chromeHidden } = useChromeVisibility();
  const theme = floatingNavTheme[displayTheme];
  const isComplete = isPlanMode && !canNext;

  const handlePrev = () => {
    console.debug('[FloatingChapterNav] prev', { canPrev, canNext });
    onPrev();
  };

  const handleNext = () => {
    console.debug(`[FloatingChapterNav] ${isComplete ? 'complete' : 'next'}`, { canPrev, canNext });
    onNext();
  };

  return (
    <div
      className={`fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-40 mx-auto flex max-w-md items-center justify-between px-4 pointer-events-none transition-transform duration-300 ${
        chromeHidden ? 'translate-y-0' : 'translate-y-[calc(-1*(var(--dock-nav-h)-4px))]'
      }`}
    >
      <button
        onClick={handlePrev}
        disabled={!canPrev}
        aria-label="Предыдущая глава"
        data-testid="floating-nav-prev"
        className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md active:scale-90 disabled:opacity-20 transition-all ${theme.surface}`}
      >
        <ChevronLeft size={26} strokeWidth={1.5} />
      </button>

      <button
        onClick={handleNext}
        disabled={!isPlanMode && !canNext}
        aria-label={isComplete ? 'Завершить день' : 'Следующая глава'}
        data-testid="floating-nav-next"
        className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full shadow-md active:scale-95 disabled:opacity-20 transition-all ${theme.cta}`}
      >
        {isComplete ? <Check size={24} strokeWidth={2.5} /> : <ChevronRight size={24} strokeWidth={2.5} />}
      </button>
    </div>
  );
};

export default FloatingChapterNav;
