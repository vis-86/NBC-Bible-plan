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
    text: 'Установите приложение и скачайте Писание и песни — читайте в метро, в дороге, где угодно.',
  },
];

/**
 * Секция «Что это» — четыре карточки ключевых возможностей.
 * Спокойная сетка на токен-поверхностях, без стеклянных эффектов.
 */
export const About: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section className="py-16 sm:py-24" data-landing-about>
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-app-primary">
          Возможности
        </p>
        <h2 className="mt-3 font-serif text-[clamp(30px,4.5vw,46px)] font-medium leading-[1.1] tracking-[-0.02em] text-app-text">
          Держитесь плана — и легко догоняйте
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-app-text-secondary">
          Приложение делает чтение по плану удобным и предсказуемым. Пропустили день —
          отметьте и продолжайте. Пропустили много — не унывайте: отметьте все разом
          и просто читайте дальше.
        </p>
        <blockquote className="mx-auto mt-8 max-w-lg">
          <p className="font-serif text-[clamp(19px,2.4vw,24px)] italic leading-[1.5] text-app-text">
            «…забывая заднее и простираясь вперёд, стремлюсь к цели»
          </p>
          <cite className="mt-3 block text-sm font-semibold not-italic tracking-wide text-app-text-muted">
            Филиппийцам 3:13–14
          </cite>
        </blockquote>
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
            className="rounded-app-card border border-app-border bg-app-surface p-7 shadow-app-sm transition-shadow hover:shadow-app-md sm:p-9"
          >
            <div className="grid h-12 w-12 place-items-center rounded-app-lg bg-app-primary-light text-app-primary">
              <Icon size={24} strokeWidth={2} />
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight text-app-text">{title}</h3>
            <p className="mt-2 leading-relaxed text-app-text-secondary">{text}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
};
