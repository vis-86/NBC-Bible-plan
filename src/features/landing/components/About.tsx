'use client';

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BookOpen, Sparkles, BookMarked, Music, WifiOff, MessageCircle, type LucideIcon } from 'lucide-react';
import { isAIEnabled } from '@/shared/utils/constants';
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
    icon: Sparkles,
    title: 'Прогресс без вины',
    text: 'Видно, сколько уже прочитано. Без красных тревог и догоняющих счётчиков.',
  },
  {
    icon: BookMarked,
    title: 'Читалка со справочником',
    text: 'Читаете прямо в приложении. Нужен контекст — справочник под рукой.',
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

const PASTOR_FEATURE: Feature = {
  icon: MessageCircle,
  title: 'Чат с пастором',
  text: 'Застряли на трудном месте? Спросите ИИ-помощника — объяснит по-доброму.',
};

/**
 * Секция «Что это» — карточки ключевых фич с плотным копирайтом.
 * Карточка чата с пастором показывается только при включённом ИИ (`isAIEnabled`).
 */
export const About: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;
  const features = isAIEnabled() ? [...FEATURES, PASTOR_FEATURE] : FEATURES;

  return (
    <section className="py-16 sm:py-20" data-landing-about>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-[clamp(28px,4vw,40px)] font-medium leading-tight tracking-[-0.02em] text-app-text">
          Спокойное чтение каждый день
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-app-text-secondary">
          Всё, чтобы держаться плана без напряжения — и возвращаться, когда выпали из ритма.
        </p>
      </div>

      <motion.div
        className="mt-12 grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:gap-6"
        variants={revealContainer}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={revealViewport}
      >
        {features.map(({ icon: Icon, title, text }) => (
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
