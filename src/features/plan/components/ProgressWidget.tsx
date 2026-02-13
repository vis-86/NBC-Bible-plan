'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';

interface ProgressWidgetProps {
  readCount: number;
  totalChapters: number;
  percentage: number;
  onClick: () => void;
}

export const ProgressWidget: React.FC<ProgressWidgetProps> = ({
  readCount,
  totalChapters,
  percentage,
  onClick
}) => {
  return (
    <button 
      onClick={onClick}
      className="card-apple w-full p-4 flex items-center justify-between group active:scale-[0.98] transition-all"
    >
      <div className="flex items-center gap-4">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="24" cy="24" r="20" stroke="#f3f4f6" strokeWidth="4" fill="none" />
            <circle 
              cx="24" cy="24" r="20" 
              stroke={percentage === 100 ? '#22c55e' : '#ef4444'} 
              strokeWidth="4" 
              fill="none" 
              strokeDasharray="126"
              strokeDashoffset={126 - (126 * percentage) / 100}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-[10px] font-bold text-stone-800 dark:text-stone-200">{percentage}%</span>
        </div>
        <div className="text-left">
          <div className="font-bold text-stone-900 dark:text-stone-100">Прогресс Библии</div>
          <div className="text-xs text-stone-500 dark:text-stone-400">{readCount} из {totalChapters} глав</div>
        </div>
      </div>
      <ChevronRight size={20} className="text-stone-300 dark:text-stone-500 group-hover:text-stone-500 dark:group-hover:text-stone-300" />
    </button>
  );
};

