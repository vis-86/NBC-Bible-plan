'use client';

import React from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Check } from 'lucide-react';
import { PhoneMockup } from './PhoneMockup';
import { PrimaryCta, LoginButton } from './cta';
import { isRegisterEnabled } from '@/shared/utils/constants';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } },
};

/**
 * Hero в духе apple.com: всё по центру — крупный serif-заголовок с плотным
 * трекингом, короткий подзаголовок, две CTA и телефон с реальным экраном ниже.
 * Без декоративных блобов и градиентного текста — акцент делает типографика.
 */
export const Hero: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section className="flex flex-col items-center pb-4 pt-12 text-center sm:pt-20" data-landing-hero>
      <motion.div
        className="flex max-w-4xl flex-col items-center"
        variants={container}
        initial={reduceMotion ? false : 'hidden'}
        animate="show"
      >
        <motion.span
          variants={rise}
          className="inline-flex items-center gap-2 rounded-full border border-app-border bg-app-surface/70 px-4 py-2 text-[13px] font-semibold text-app-text-secondary backdrop-blur"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-app-success" />
          {isRegisterEnabled() ? 'Бесплатно. Без рекламы и спешки' : 'Доступ — по приглашению от церкви'}
        </motion.span>

        <motion.h1
          variants={rise}
          className="mt-7 font-serif text-[clamp(42px,7vw,76px)] font-medium leading-[1.03] tracking-[-0.025em] text-app-text"
        >
          План чтения Библии
          <span className="block italic text-app-primary">всегда под рукой</span>
        </motion.h1>

        <motion.p
          variants={rise}
          className="mt-6 max-w-[44ch] text-[clamp(17px,2vw,21px)] leading-[1.55] text-app-text-secondary"
        >
          Читайте Писание по плану, отмечайте прочитанное и пойте вместе с церковью.
          Работает без интернета — дома, в дороге, где угодно.
        </motion.p>

        <motion.div variants={rise} className="mt-9 flex flex-wrap justify-center gap-3.5">
          <PrimaryCta />
          <LoginButton />
        </motion.div>

        <motion.p variants={rise} className="mt-6 flex items-center justify-center gap-2.5 text-sm text-app-text-muted">
          <Check size={17} strokeWidth={2.4} className="shrink-0 text-app-success" />
          <span>
            {'Работает онлайн и офлайн — офлайн стабильно после '}
            <a href="#install" className="underline underline-offset-2 transition-colors hover:text-app-text">
              установки на телефон
            </a>
          </span>
        </motion.p>
      </motion.div>

      {/* Телефон по центру, «выходит» из мягкого свечения */}
      <motion.div
        className="relative mt-14 grid place-items-center sm:mt-16"
        variants={rise}
        initial={reduceMotion ? false : 'hidden'}
        animate="show"
      >
        <div
          aria-hidden
          className="absolute h-[70%] w-[130%] rounded-full blur-[80px]"
          style={{ background: 'var(--app-primary-muted)' }}
        />
        <PhoneMockup />
      </motion.div>
    </section>
  );
};
