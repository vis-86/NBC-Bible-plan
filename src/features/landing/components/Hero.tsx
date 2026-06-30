'use client';

import React from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Check } from 'lucide-react';
import { PhoneMockup } from './PhoneMockup';
import { AccessButton, LoginButton } from './cta';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } },
};

/**
 * Hero по эталону «Sacred Minimal»: serif-заголовок с индиго-курсив-акцентом,
 * одно-фразовый value-prop, чёрная первичная CTA + призрачная «Войти», и
 * мокап приложения на телефоне с плавающим бейджем.
 */
export const Hero: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;
  // При reduced-motion отключаем и въезд (variants), и float-колебание.
  const floatAnim = reduceMotion ? undefined : { y: [0, -14, 0] };
  const floatTransition = reduceMotion
    ? undefined
    : { duration: 7, repeat: Infinity, ease: 'easeInOut' as const };

  return (
    <section
      className="grid grid-cols-1 items-center gap-2 py-6 lg:min-h-[calc(100vh-110px)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-6 lg:pb-16"
      data-landing-hero
    >
      {/* Copy */}
      <motion.div
        className="text-center lg:text-left"
        variants={container}
        initial={reduceMotion ? false : 'hidden'}
        animate="show"
      >
        <motion.span
          variants={rise}
          className="inline-flex items-center gap-2 rounded-full border border-[rgba(199,154,75,0.3)] bg-[var(--warm-soft,#f4e7cf)] px-3.5 py-[7px] text-[13px] font-semibold uppercase tracking-[0.04em] text-app-text-secondary"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--warm,#c79a4b)]" />
          Читайте Писание спокойно
        </motion.span>

        <motion.h1
          variants={rise}
          className="mt-5 font-serif text-[clamp(40px,6vw,68px)] font-medium leading-[1.04] tracking-[-0.02em] text-app-text"
        >
          План чтения Библии
          <span className="block italic text-app-primary">без чувства вины</span>
        </motion.h1>

        <motion.p
          variants={rise}
          className="mx-auto mt-6 max-w-[30ch] text-[clamp(17px,2vw,20px)] leading-[1.55] text-app-text-secondary lg:mx-0"
        >
          Читайте в своём ритме. Отстали на неделю — просто продолжайте с того места, где остановились.
        </motion.p>

        <motion.div
          variants={rise}
          className="mt-9 flex flex-wrap justify-center gap-3.5 lg:justify-start"
        >
          <AccessButton />
          <LoginButton />
        </motion.div>

        <motion.p
          variants={rise}
          className="mt-5 flex items-center justify-center gap-2.5 text-sm text-app-text-muted lg:justify-start"
        >
          <Check size={17} strokeWidth={2.4} className="shrink-0 text-app-success" />
          Без рекламы и спешки. Доступ — по приглашению от церкви.
        </motion.p>
      </motion.div>

      {/* Phone mockup */}
      <motion.div
        className="relative mt-10 grid place-items-center lg:mt-0"
        variants={rise}
        initial={reduceMotion ? false : 'hidden'}
        animate="show"
      >
        {/* Warm glow blob */}
        <div
          aria-hidden
          className="absolute aspect-square w-[78%] rounded-full blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(199,154,75,0.28), transparent 65%)' }}
        />

        {/* Floating badge (декоративный, как и сам мокап) */}
        <motion.div
          aria-hidden
          className="absolute left-0 top-[130px] z-[2] flex items-center gap-2.5 rounded-2xl border border-app-border bg-app-surface px-4 py-3 shadow-[0_8px_32px_rgba(15,23,42,0.12)] max-[420px]:hidden lg:-left-6"
          animate={floatAnim}
          transition={floatTransition ? { ...floatTransition, delay: -2.5 } : undefined}
        >
          <div className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-app-success text-white">
            <Check size={18} strokeWidth={2.6} />
          </div>
          <div>
            <p className="text-xs font-bold text-app-text">День отмечен</p>
            <p className="text-[11px] text-app-text-muted">Так держать 🙌</p>
          </div>
        </motion.div>

        <motion.div animate={floatAnim} transition={floatTransition}>
          <PhoneMockup />
        </motion.div>
      </motion.div>
    </section>
  );
};
