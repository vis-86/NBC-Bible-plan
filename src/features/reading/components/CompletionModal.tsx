'use client';

import React, { useEffect, useRef } from 'react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { ReadingPlanDay } from '@/types';
import { CircleCheckIcon, type CircleCheckIconHandle } from '@/shared/components/ui/circle-check';

interface CompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  day: ReadingPlanDay | null;
  totalDays?: number;
  actionLabel?: string;
}

export const CompletionModal: React.FC<CompletionModalProps> = ({
  isOpen,
  onClose,
  day,
  totalDays = 365,
  actionLabel = 'Продолжить',
}) => {
  const iconRef = useRef<CircleCheckIconHandle>(null);
  const completionProgress = Math.min(1, Math.max(0, day ? day.id / totalDays : 0));

  useEffect(() => {
    if (!isOpen) return;
    // Ждём 200мс: иконка появляется и сразу запускает прорисовку галочки
    const delayMs = 200;
    const id = window.setTimeout(() => {
      // Даём React дорендерить SVG перед стартом анимации.
      requestAnimationFrame(() => iconRef.current?.startAnimation());
    }, delayMs);

    return () => window.clearTimeout(id);
  }, [isOpen]);
  
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} hideChromeWhileOpen>
      {/* pb-2: нижний зазор к home-indicator даёт body шита (safe-area padding). */}
      <div className="flex flex-col items-center pt-2 pb-2">
        
        {/* Большая галочка (lucide-animated) */}
        <div className="w-20 h-20 flex items-center justify-center mb-6 completion-icon-fade-in">
          <CircleCheckIcon ref={iconRef} className="text-app-text" size={80} />
        </div>

        {/* Заголовок */}
        <h2 className="text-3xl font-black text-app-text mb-8">
          День {day?.id} из {totalDays}
        </h2>

        {/* Прогресс-бар */}
        <div className="w-full h-1.5 bg-app-surface-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-app-success completion-progress-fill"
            style={
              {
                ['--completion-progress' as string & keyof React.CSSProperties]: String(completionProgress),
              } as React.CSSProperties
            }
          />
        </div>

        {/* Кнопка закрытия/продолжения */}
        <button
          onClick={onClose}
          className="mt-8 w-full py-4 bg-app-text text-app-text-inverse rounded-2xl font-bold active:scale-95 transition-all hover:opacity-90"
        >
          {actionLabel}
        </button>
      </div>
    </BottomSheet>
  );
};

