'use client';

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PrimaryCta, LoginButton } from './cta';
import { revealItem, revealViewport } from './anim';

/**
 * Финальный CTA — тёмная панель-«витрина» (токен `--app-overlay`, как у карточки
 * стиха дня в приложении) с теми же двумя кнопками, инвертированными под тёмный
 * фон через `!`-override (--app-overlay-text всегда светлый по контракту токена).
 */
export const FinalCta: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section className="py-16 sm:py-24" data-landing-final-cta>
      <motion.div
        className="mx-auto max-w-4xl overflow-hidden rounded-[36px] bg-app-overlay px-6 py-16 text-center shadow-app-card sm:px-12 sm:py-20"
        variants={revealItem}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={revealViewport}
      >
        <h2 className="font-serif text-[clamp(30px,4.5vw,46px)] font-medium leading-[1.1] tracking-[-0.02em] text-app-overlay-text">
          Начните и держитесь плана
          <span className="block italic opacity-80">уже сегодня</span>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-app-overlay-text/75">
          Пропустили несколько дней — отметьте разом и продолжайте. Главное — не останавливаться.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3.5">
          <PrimaryCta className="!bg-app-overlay-text !text-app-overlay !shadow-none" />
          <LoginButton className="!border-app-overlay-text/25 !bg-transparent !text-app-overlay-text hover:!bg-app-overlay-text/10" />
        </div>
      </motion.div>
    </section>
  );
};
