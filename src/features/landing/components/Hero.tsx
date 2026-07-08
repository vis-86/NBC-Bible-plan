'use client';

import React from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Check, Flame } from 'lucide-react';
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
          Онлайн и офлайн
        </motion.span>

        <motion.h1
          variants={rise}
          className="mt-6 font-serif text-[clamp(40px,6vw,68px)] font-medium leading-[1.04] tracking-[-0.021em] text-app-text"
        >
          План чтения Библии
          <span className="mt-1 block bg-gradient-to-r from-app-primary via-[#6d5bd0] to-[var(--warm,#c79a4b)] bg-clip-text italic text-transparent">
            всегда под рукой
          </span>
        </motion.h1>

        <motion.p
          variants={rise}
          className="mx-auto mt-6 max-w-[34ch] text-[clamp(17px,2vw,20px)] leading-[1.55] text-app-text-secondary lg:mx-0"
        >
          Работает без интернета и не боится блокировок. Открывайте Писание и план в любой момент — дома, в дороге, где угодно.
        </motion.p>

        <motion.div
          variants={rise}
          className="mt-8 flex flex-wrap justify-center gap-3.5 lg:justify-start"
        >
          <PrimaryCta />
          <LoginButton />
        </motion.div>

        <motion.p
          variants={rise}
          className="mt-6 flex items-center justify-center gap-2.5 text-sm text-app-text-muted lg:justify-start"
        >
          <Check size={17} strokeWidth={2.4} className="shrink-0 text-app-success" />
          {isRegisterEnabled() ? 'Бесплатно. Без рекламы и спешки.' : 'Без рекламы и спешки. Доступ — по приглашению от церкви.'}
        </motion.p>
      </motion.div>

      {/* Phone mockup */}
      <motion.div
        className="relative mt-10 grid place-items-center lg:mt-0"
        variants={rise}
        initial={reduceMotion ? false : 'hidden'}
        animate="show"
      >
        {/* Крупный органический блоб — акцентная «подложка» под телефоном.
            Палитра дашборда: indigo → warm gold, мягкий blur, низкая насыщенность. */}
        <div
          aria-hidden
          className="absolute h-[86%] w-[92%] blur-[64px]"
          style={{
            borderRadius: '58% 42% 54% 46% / 56% 48% 52% 44%',
            background:
              'linear-gradient(135deg, rgba(79,70,229,0.34), rgba(199,154,75,0.30) 68%, rgba(16,185,129,0.16))',
            transform: 'translateY(7%) rotate(-8deg)',
          }}
        />

        {/* Тонкое контурное кольцо (gold) — верхний правый акцент */}
        <div
          aria-hidden
          className="absolute right-[6%] top-[8%] h-20 w-20 rounded-full border-2 border-[var(--warm,#c79a4b)]/35 max-[420px]:hidden"
        />

        {/* Dot-grid (indigo) — нижний левый акцент, с мягким фейдом к краям */}
        <div
          aria-hidden
          className="absolute bottom-[6%] left-[2%] h-24 w-24 opacity-[0.35] max-[420px]:hidden"
          style={{
            backgroundImage:
              'radial-gradient(circle, var(--app-primary, #4f46e5) 1.3px, transparent 1.6px)',
            backgroundSize: '15px 15px',
            maskImage: 'radial-gradient(circle at center, #000 35%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(circle at center, #000 35%, transparent 75%)',
          }}
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

        {/* Стрик — правый акцент (gold), свой ритм колебания */}
        <motion.div
          aria-hidden
          className="absolute right-0 top-[236px] z-[2] flex items-center gap-2.5 rounded-2xl border border-app-border bg-app-surface px-4 py-3 shadow-[0_8px_32px_rgba(15,23,42,0.12)] max-[640px]:hidden lg:-right-4"
          animate={floatAnim}
          transition={floatTransition ? { ...floatTransition, delay: -4.5 } : undefined}
        >
          <div className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-[var(--warm,#c79a4b)] text-white">
            <Flame size={18} strokeWidth={2.6} />
          </div>
          <div>
            <p className="text-xs font-bold text-app-text">7 дней подряд</p>
            <p className="text-[11px] text-app-text-muted">Не пропускаю 🔥</p>
          </div>
        </motion.div>

        {/* Прогресс года — нижний правый акцент (indigo), третий ритм */}
        <motion.div
          aria-hidden
          className="absolute bottom-3 right-[10%] z-[2] flex items-center gap-2.5 rounded-2xl border border-app-border bg-app-surface px-4 py-3 shadow-[0_8px_32px_rgba(15,23,42,0.12)] max-[640px]:hidden lg:right-[14%]"
          animate={floatAnim}
          transition={floatTransition ? { ...floatTransition, delay: -1.5 } : undefined}
        >
          <div
            className="grid h-[34px] w-[34px] place-items-center rounded-full"
            style={{ background: 'conic-gradient(var(--app-primary,#4f46e5) 68%, var(--app-primary-light,#eef2ff) 0)' }}
          >
            <div className="grid h-[26px] w-[26px] place-items-center rounded-full bg-app-surface text-[10px] font-bold text-app-primary">
              68%
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-app-text">План года</p>
            <p className="text-[11px] text-app-text-muted">Идёшь по графику</p>
          </div>
        </motion.div>

        <motion.div animate={floatAnim} transition={floatTransition}>
          {/* Лёгкий наклон — телефон «лежит» на блобе (статичный, не ломает float/reduced-motion) */}
          <div className="rotate-[-4deg] will-change-transform">
            <PhoneMockup />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
};
