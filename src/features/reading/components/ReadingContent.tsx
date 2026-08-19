'use client';

import React from 'react';
import { Info, Loader2, CheckCircle2, Circle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';
import { useDelayedFlag } from '@/shared/hooks/useDelayedFlag';
import { BibleText } from '@/shared/components/bible/BibleText';
import { ReadingSettings } from '@/features/reading/types';
import { isAIEnabled } from '@/shared/utils/constants';

interface ReadingContentProps {
  text: string;
  loading: boolean;
  /**
   * Идентификатор главы (`книга-глава`). Перезапускает появление текста, когда глава
   * меняется мгновенно — из памяти-кэша, без промежуточного `loading`.
   */
  contentKey: string;
  settings: ReadingSettings;
  displayTheme: 'light' | 'dark' | 'sepia';
  contextInfo: string | null;
  infoLoading: boolean;
  onContextClose: () => void;
  day: any;
  currentItem: any;
  onChapterRead?: (dayId: number, itemNumber: number) => void;
}

export const ReadingContent: React.FC<ReadingContentProps> = ({
  text,
  loading,
  contentKey,
  settings,
  displayTheme,
  contextInfo,
  infoLoading,
  onContextClose,
  day,
  currentItem,
  onChapterRead
}) => {
  const showSpinner = useDelayedFlag(loading);

  const themeClasses = {
    light: 'bg-white text-stone-800',
    dark: 'bg-stone-900 text-stone-100',
    sepia: 'bg-amber-50 text-stone-900'
  };

  // Спиннер — с задержкой: закешированная глава приходит за десятки миллисекунд, и
  // мгновенный спиннер успевал лишь мигнуть. Место под него держится всегда — иначе
  // его появление само по себе двигало бы контент.
  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center py-40 space-y-4 min-h-[50vh] ${themeClasses[displayTheme]}`}>
        {showSpinner && (
          <span className="animate-content-in">
            <LoadingSpinner size={40} />
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      {isAIEnabled() && infoLoading && (
        <div className="my-6 p-4 rounded-xl bg-app-surface-muted border border-app-border flex items-center gap-3 animate-pulse">
          <Loader2 size={18} className="animate-spin text-app-text-muted" />
          <span className="text-sm font-medium text-app-text-secondary">Загрузка контекста...</span>
        </div>
      )}

      {isAIEnabled() && contextInfo && !infoLoading && (
        <div className="my-6 bg-app-accent-light border border-app-accent/20 rounded-xl p-5 relative">
          <h4 className="font-bold text-app-accent text-sm uppercase tracking-wide mb-2 flex items-center gap-2">
            <Info size={16} /> Контекст
          </h4>
          <div className="text-sm text-app-text leading-relaxed">
            <ReactMarkdown>{contextInfo}</ReactMarkdown>
          </div>
          <button
            onClick={onContextClose}
            className="absolute top-2 right-2 p-2 text-app-text-muted hover:text-app-text"
          >
            ✕
          </button>
        </div>
      )}

      <div key={contentKey} className="animate-content-in">
        <BibleText text={text} settings={settings} displayTheme={displayTheme} />
      </div>
    </>
  );
};

