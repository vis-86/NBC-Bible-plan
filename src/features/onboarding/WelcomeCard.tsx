'use client';

import React from 'react';
import { BookOpen, CalendarCheck, Music, X, type LucideIcon } from 'lucide-react';

interface WelcomeCardProps {
  userName?: string;
  onDismiss: () => void;
}

interface Tip {
  icon: LucideIcon;
  text: string;
}

const TIPS: Tip[] = [
  { icon: BookOpen, text: 'Чтение на сегодня — в карточке ниже. Нажмите «Начать чтение».' },
  { icon: CalendarCheck, text: 'Отмечайте прочитанное. Пропустили дни — отметьте их в календаре.' },
  { icon: Music, text: 'Песни и сеты для служения — во вкладках внизу экрана.' },
];

/**
 * Приветствие нового пользователя сверху главной: три подсказки, где что лежит, и «Понятно».
 * Показывается один раз после регистрации (флаг — `welcomeStore`), работает офлайн.
 */
export const WelcomeCard: React.FC<WelcomeCardProps> = ({ userName, onDismiss }) => (
  <section
    aria-labelledby="welcome-card-title"
    className="relative mx-4 mt-3 rounded-app-xl border border-app-border bg-app-surface p-4 shadow-app-sm"
    data-welcome-card
  >
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Закрыть приветствие"
      className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-app-text-muted transition-colors hover:text-app-text"
    >
      <X size={18} strokeWidth={2.2} />
    </button>
    <h2 id="welcome-card-title" className="pr-8 font-serif text-lg font-medium text-app-text">
      {userName ? `Добро пожаловать, ${userName}!` : 'Добро пожаловать!'}
    </h2>
    <ul className="mt-3 space-y-2.5">
      {TIPS.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-3 text-sm leading-snug text-app-text-secondary">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-app-md bg-app-primary-light text-app-primary">
            <Icon size={15} strokeWidth={2.2} />
          </span>
          <span className="pt-1">{text}</span>
        </li>
      ))}
    </ul>
    <button
      type="button"
      onClick={onDismiss}
      className="mt-4 w-full rounded-full bg-app-text px-4 py-2.5 text-sm font-semibold text-app-text-inverse transition-opacity active:opacity-80"
      data-welcome-card-dismiss
    >
      Понятно
    </button>
  </section>
);
