'use client';

import React from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { ReadingPlanDay, PlanItem } from '@/types';
import { parseReadingItem, getFullBookName } from '@/shared/utils/bible';

interface ChapterPickerProps {
  isOpen: boolean;
  onClose: () => void;
  day: ReadingPlanDay | null;
  currentItem: PlanItem | null;
  onSelectChapter: (item: PlanItem) => void;
}

export const ChapterPicker: React.FC<ChapterPickerProps> = ({
  isOpen,
  onClose,
  day,
  currentItem,
  onSelectChapter
}) => {
  if (!day || !day.items || day.items.length === 0) return null;

  return (
    <BottomSheet 
      isOpen={isOpen} 
      onClose={onClose}
      title={`Выберите главу - День ${day.id}`}
    >
      <div className="space-y-2 pb-24">
        {day.items.map((item) => {
          const itemReading = parseReadingItem(item.readText);
          const isCurrent = currentItem?.item === item.item;
          
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectChapter(item);
                onClose();
              }}
              className={`
                w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all
                ${isCurrent 
                  ? 'border-red-500 bg-red-50' 
                  : 'border-stone-200 hover:border-stone-300 bg-white'
                }
              `}
            >
              <div 
                className={`
                  w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0
                  ${item.completed 
                    ? 'bg-red-500 border-red-500' 
                    : 'border-stone-300'
                  }
                `}
              >
                {item.completed && (
                  <CheckCircle2 size={14} className="text-white" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className={`font-medium ${isCurrent ? 'text-red-700' : 'text-stone-900'}`}>
                  {itemReading ? `${itemReading.book} ${itemReading.chapter}` : item.readText}
                </div>
                {itemReading && (
                  <div className="text-xs text-stone-500 mt-0.5">
                    День {item.dayNumber}
                  </div>
                )}
              </div>
              {isCurrent && (
                <ChevronRight size={16} className="text-red-500" />
              )}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
};

