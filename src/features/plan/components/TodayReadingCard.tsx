'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Check, ChevronRight, Play } from 'lucide-react';
import { ReadingPlanDay, BibleReference } from '@/types';
import { formatDateShort, parseReadingItem } from '@/shared/utils/bible';

interface TodayReadingCardProps {
  day: ReadingPlanDay;
  totalDays: number;
  isToday: boolean;
  yearProgress: number;
  onToggleItem: (dayId: number, itemNumber: number) => void;
  onSelectReading: (day: ReadingPlanDay, reading: BibleReference) => void;
  onStartReading: () => void;
}

const CIRCLE = 2 * Math.PI * 20;
const currentYear = new Date().getFullYear();

export const TodayReadingCard: React.FC<TodayReadingCardProps> = ({
  day,
  totalDays,
  isToday,
  yearProgress,
  onToggleItem,
  onSelectReading,
  onStartReading,
}) => {
  const router = useRouter();
  const totalItems = day.items?.length ?? day.readings?.length ?? 1;
  const strokeDashoffset = CIRCLE - (CIRCLE * yearProgress) / 100;

  const estimatedMinutes = totalItems * 3;
  const displayTime =
    estimatedMinutes < 60 ? `~${estimatedMinutes} мин` : `~${Math.round(estimatedMinutes / 60)} ч`;
  const title = isToday ? 'Чтение на сегодня' : `Чтение на ${formatDateShort(day.dateStr)}`;

  return (
    <section data-today-reading-card className="px-4 mb-6">
      <div className="bg-app-overlay rounded-[32px] p-1 shadow-app-card relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-app-primary-muted rounded-full blur-3xl -mr-16 -mt-16" aria-hidden />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-app-success-muted rounded-full blur-2xl -ml-10 -mb-10" aria-hidden />

        <div className="relative bg-app-overlay-inner backdrop-blur-sm rounded-[28px] p-6 border border-white/5">
          <div data-today-reading-card-header className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  data-today-reading-card-plan-badge
                  onClick={() => router.push('/dashboard/calendar')}
                  className="px-2.5 py-0.5 rounded-md bg-app-success-muted border border-app-success/20 text-app-success text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-app-success/20 transition-colors inline-flex items-center gap-1"
                  title="Открыть календарь"
                >
                  <Calendar size={12} />
                  План {currentYear}
                </button>
                <span data-today-reading-card-day-counter className="text-app-text-inverse/50 text-xs">
                  День {day.id} из {totalDays}
                </span>
              </div>
              <h2 data-today-reading-card-title className="text-2xl font-bold text-app-text-inverse mb-1">{title}</h2>
              <p data-today-reading-card-time className="text-app-text-inverse/50 text-sm">Примерное время: {displayTime}</p>
            </div>

            <div data-today-reading-card-progress className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90" aria-label={`Годовой прогресс: ${yearProgress}%`}>
                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" fill="none" className="text-white/10" />
                <circle
                  cx="24" cy="24" r="20"
                  stroke="currentColor" strokeWidth="3" fill="none"
                  strokeDasharray={CIRCLE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="text-app-success transition-[stroke-dashoffset] duration-300"
                />
              </svg>
              <span className="absolute text-[10px] font-bold text-app-text-inverse">{yearProgress}%</span>
            </div>
          </div>

          <div data-today-reading-card-list className="space-y-3 mb-6">
            {(day.items ?? []).length > 0
              ? day.items!.map((item) => {
                  const reading = parseReadingItem(item.readText);
                  const label = reading ? `${reading.book} ${reading.chapter}` : item.readText;

                  return (
                    <label
                      key={item.item}
                      data-today-reading-card-item={item.item}
                      data-today-reading-card-item-completed={item.completed || undefined}
                      className="flex items-center p-3 rounded-xl bg-white/5 border border-white/8 cursor-pointer hover:bg-white/10 transition-all group"
                    >
                      <div className="relative flex items-center justify-center w-6 h-6 mr-4 flex-shrink-0">
                        <input
                          data-today-reading-card-item-checkbox={item.item}
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => onToggleItem(day.id, item.item)}
                          className="peer appearance-none w-6 h-6 rounded-full border-2 border-white/30 checked:bg-app-success checked:border-app-success transition-colors cursor-pointer"
                        />
                        <Check
                          className="w-3.5 h-3.5 text-white absolute opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none stroke-[3]"
                          strokeWidth={3}
                        />
                      </div>
                      <button
                        type="button"
                        data-today-reading-card-item-link={item.item}
                        onClick={() => reading && onSelectReading(day, reading)}
                        className="flex-1 text-left"
                      >
                        <span className="text-lg font-medium text-app-text-inverse/80 group-hover:text-app-text-inverse transition-colors">
                          {label}
                        </span>
                      </button>
                      <ChevronRight className="w-5 h-5 text-app-text-inverse/30 group-hover:text-app-text-inverse/60 flex-shrink-0" aria-hidden />
                    </label>
                  );
                })
              : day.readings?.map((reading, idx) => (
                  <label
                    key={idx}
                    data-today-reading-card-item={idx}
                    className="flex items-center p-3 rounded-xl bg-white/5 border border-white/8 cursor-pointer hover:bg-white/10 transition-all group"
                  >
                    <div className="relative flex items-center justify-center w-6 h-6 mr-4 flex-shrink-0">
                      <input
                        type="checkbox"
                        readOnly
                        className="peer appearance-none w-6 h-6 rounded-full border-2 border-white/30"
                      />
                    </div>
                    <button
                      type="button"
                      data-today-reading-card-item-link={idx}
                      onClick={() => onSelectReading(day, reading)}
                      className="flex-1 text-left"
                    >
                      <span className="text-lg font-medium text-app-text-inverse/80 group-hover:text-app-text-inverse transition-colors">
                        {reading.book} {reading.chapter}
                      </span>
                    </button>
                    <ChevronRight className="w-5 h-5 text-app-text-inverse/30 group-hover:text-app-text-inverse/60 flex-shrink-0" aria-hidden />
                  </label>
                ))}
          </div>

          <button
            type="button"
            data-today-reading-card-start-btn
            onClick={onStartReading}
            className="w-full py-3.5 bg-app-text-inverse text-app-text font-bold rounded-xl shadow-lg hover:bg-app-surface-elevated active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-current" aria-hidden />
            Начать чтение
          </button>
        </div>
      </div>
    </section>
  );
};
