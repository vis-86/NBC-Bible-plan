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
                w-full min-h-11 flex items-center gap-3 p-4 rounded-app-md border-2 transition-all
                ${isCurrent
                  ? 'border-app-primary bg-app-primary-light'
                  : 'border-app-border hover:border-app-border-subtle bg-app-surface'
                }
              `}
            >
              <div
                className={`
                  w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0
                  ${item.completed
                    ? 'bg-app-success border-app-success'
                    : 'border-app-border'
                  }
                `}
              >
                {item.completed && (
                  <CheckCircle2 size={14} className="text-app-text-inverse" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className={`font-medium ${isCurrent ? 'text-app-primary' : 'text-app-text'}`}>
                  {itemReading ? `${itemReading.book} ${itemReading.chapter}` : item.readText}
                </div>
                {itemReading && (
                  <div className="text-xs text-app-text-muted mt-0.5">
                    День {item.dayNumber}
                  </div>
                )}
              </div>
              {isCurrent && (
                <ChevronRight size={16} className="text-app-primary" />
              )}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
};

