'use client';

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BookOpen, CalendarCheck, Music, WifiOff, type LucideIcon } from 'lucide-react';
import { revealContainer, revealItem, revealViewport } from './anim';

interface Feature {
  icon: LucideIcon;
  title: string;
  text: string;
}

const FEATURES: Feature[] = [
  {
    icon: BookOpen,
    title: 'Удобный план',
    text: 'Весь план перед глазами. Прочитали день — отметили одним тапом.',
  },
  {
    icon: CalendarCheck,
    title: 'Следите за прогрессом',
    text: 'Видно, что прочитано и что пропущено. Отметьте пропущенные дни разом и идите дальше.',
  },
  {
    icon: Music,
    title: 'Песни с аккордами',
    text: 'Сборник песен церкви — с аккордами, поиском и удобным шрифтом.',
  },
  {
    icon: WifiOff,
    title: 'Работает без интернета',
    text: 'Скачайте Писание и песни — читайте в метро, в дороге, где угодно.',
  },
];

/**
 * Секция «Что это» — карточки ключевых фич с плотным копирайтом.
 */
export const About: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section className="py-16 sm:py-20" data-landing-about>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-[clamp(28px,4vw,40px)] font-medium leading-tight tracking-[-0.02em] text-app-text">
          Держитесь плана — и легко догоняйте
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-app-text-secondary">
          Приложение делает чтение по плану удобным и предсказуемым. Пропустили — отметили разом и продолжили. Главное — идти дальше.
        </p>
      </div>

      <motion.div
        className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-2 lg:gap-6"
        variants={revealContainer}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={revealViewport}
      >
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <motion.article
            key={title}
            variants={revealItem}
            className="rounded-3xl border border-app-border bg-app-surface/70 p-6 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-shadow hover:shadow-[0_12px_40px_rgba(15,23,42,0.1)] sm:p-8"
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-app-primary-light text-app-primary">
              <Icon size={24} strokeWidth={2} />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-app-text">{title}</h3>
            <p className="mt-2 leading-relaxed text-app-text-secondary">{text}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
};
