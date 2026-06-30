'use client';

import React from 'react';
import { Check } from 'lucide-react';

/**
 * Мокап экрана приложения для Hero (faux PlanView): стих дня + дни недели
 * с emerald-галочками «выполнено» и индиго-кружком «Сегодня».
 *
 * Это и есть graceful-плейсхолдер: всегда корректно рендерится без внешних
 * картинок. В проде faux-экран можно заменить на реальный скрин
 * `public/landing/hero-app.png`.
 */

interface DayRow {
  day: string;
  ref: string;
  state: 'done' | 'today' | 'future';
}

const WEEK: DayRow[] = [
  { day: 'Понедельник', ref: 'Бытие 1–3', state: 'done' },
  { day: 'Вторник', ref: 'Бытие 4–7', state: 'done' },
  { day: 'Сегодня', ref: 'Бытие 8–11', state: 'today' },
  { day: 'Завтра', ref: 'Бытие 12–15', state: 'future' },
];

export const PhoneMockup: React.FC = () => (
  <div
    aria-hidden
    className="relative z-[1] h-[612px] w-[300px] rounded-[44px] bg-[#0f0e0d] p-[11px] shadow-[0_30px_80px_-20px_rgba(28,25,23,0.35)]"
    data-landing-phone
  >
    {/* Notch */}
    <div className="absolute left-1/2 top-3 z-[5] h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-[#0f0e0d]" />

    <div className="flex h-full w-full flex-col overflow-hidden rounded-[34px] bg-app-bg">
      {/* Header */}
      <div className="px-[22px] pb-4 pt-[30px]">
        <p className="text-xs font-semibold text-app-text-muted">Добрый день, брат Иван</p>
        <p className="mt-0.5 font-serif text-[22px] text-app-text">Сегодня, 30 июня</p>
      </div>

      {/* Verse of the day */}
      <div className="mx-[22px] mb-[18px] mt-1 rounded-[18px] bg-gradient-to-br from-[#243045] to-[#1E293B] px-[18px] py-4 text-white shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-65">Стих дня</p>
        <p className="mt-[7px] font-serif text-[14.5px] italic leading-[1.5]">
          «Трава засыхает, цвет увядает, а слово Бога нашего пребудет вечно».
        </p>
        <p className="mt-[9px] text-[11px] font-semibold opacity-70">Исаия 40:8</p>
      </div>

      {/* This week */}
      <div className="px-[22px]">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-app-text-muted">
          Эта неделя
        </p>

        {WEEK.map((row) => (
          <div
            key={row.day}
            className={
              'mb-[9px] flex items-center gap-3 rounded-2xl border bg-app-surface px-3.5 py-3 ' +
              (row.state === 'today'
                ? 'border-app-primary/40 shadow-[0_4px_14px_rgba(79,70,229,0.1)]'
                : 'border-app-border')
            }
          >
            <div
              className={
                'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full ' +
                (row.state === 'done'
                  ? 'bg-app-success text-white'
                  : row.state === 'today'
                    ? 'border-2 border-app-primary bg-app-primary-light'
                    : 'border border-app-border bg-app-surface-muted')
              }
            >
              {row.state === 'done' && <Check size={14} strokeWidth={3} />}
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-app-text">{row.day}</p>
              <p className="mt-px text-[11.5px] text-app-text-muted">{row.ref}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
