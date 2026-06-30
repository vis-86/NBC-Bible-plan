'use client';

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AccessButton, LoginButton } from './cta';
import { revealItem, revealViewport } from './anim';

/**
 * Финальный CTA — мягкий призыв + те же две кнопки: «Получить доступ» (в поддержку)
 * и «Войти» (/login). Telegram-бот в новой invite-модели не используется.
 */
export const FinalCta: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section className="py-16 sm:py-24" data-landing-final-cta>
      <motion.div
        className="mx-auto max-w-2xl text-center"
        variants={revealItem}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={revealViewport}
      >
        <h2 className="font-serif text-[clamp(30px,4.5vw,46px)] font-medium leading-[1.1] tracking-[-0.02em] text-app-text">
          Начните читать спокойно
          <span className="block italic text-app-primary">уже сегодня</span>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-app-text-secondary">
          Без спешки и чувства вины за пропущенные дни. Просто вы и Слово.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3.5">
          <AccessButton />
          <LoginButton />
        </div>
      </motion.div>
    </section>
  );
};
