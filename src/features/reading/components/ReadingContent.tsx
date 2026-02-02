'use client';

import React from 'react';
import { Info, Loader2, CheckCircle2, Circle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';
import { BibleText } from '@/shared/components/bible/BibleText';
import { ReadingSettings } from '@/features/reading/types';
import { isAIEnabled } from '@/shared/utils/constants';

interface ReadingContentProps {
  text: string;
  loading: boolean;
  settings: ReadingSettings;
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
  settings,
  contextInfo,
  infoLoading,
  onContextClose,
  day,
  currentItem,
  onChapterRead
}) => {
  const themeClasses = {
    light: 'bg-white text-stone-800',
    dark: 'bg-stone-900 text-stone-100',
    sepia: 'bg-amber-50 text-stone-900'
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-4">
        <LoadingSpinner size={40} />
      </div>
    );
  }

  return (
    <>
      {isAIEnabled() && infoLoading && (
        <div className="my-6 p-4 rounded-xl bg-stone-50 border border-stone-100 flex items-center gap-3 animate-pulse">
          <Loader2 size={18} className="animate-spin text-stone-400" />
          <span className="text-sm font-medium text-stone-500">Загрузка контекста...</span>
        </div>
      )}
      
      {isAIEnabled() && contextInfo && !infoLoading && (
        <div className="my-6 bg-yellow-50/80 border border-yellow-100 rounded-xl p-5 relative">
          <h4 className="font-bold text-yellow-800 text-sm uppercase tracking-wide mb-2 flex items-center gap-2">
            <Info size={16} /> Контекст
          </h4>
          <div className="text-sm text-yellow-900/80 leading-relaxed">
            <ReactMarkdown>{contextInfo}</ReactMarkdown>
          </div>
          <button 
            onClick={onContextClose}
            className="absolute top-2 right-2 p-2 text-yellow-700/50 hover:text-yellow-800"
          >
            ✕
          </button>
        </div>
      )}

      <BibleText text={text} settings={settings} />
    </>
  );
};

