'use client';

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Send, Smartphone, KeyRound, Hash, UserPlus, type LucideIcon } from 'lucide-react';
import { AccessButton, RegisterButton } from './cta';
import { isRegisterEnabled } from '@/shared/utils/constants';
import { revealContainer, revealItem, revealViewport } from './anim';

interface Step {
  icon: LucideIcon;
  title: string;
  text: string;
}

/** Шаги invite-модели: доступ строго по личной ссылке из поддержки. */
const INVITE_STEPS: Step[] = [
  {
    icon: Send,
    title: 'Напишите нам',
    text: 'Пришлём вам личную ссылку-приглашение в поддержке церкви.',
  },
  {
    icon: Smartphone,
    title: 'Откройте ссылку с телефона',
    text: 'Одно касание — и вы на странице регистрации.',
  },
  {
    icon: KeyRound,
    title: 'Придумайте логин и пароль',
    text: 'Готово — вы внутри. Ни почты, ни лишних данных не нужно.',
  },
];

/** Шаги по коду церкви: код озвучивают на собрании, регистрация самостоятельная. */
const CHURCH_CODE_STEPS: Step[] = [
  {
    icon: Hash,
    title: 'Возьмите код церкви',
    text: 'Его называют на собрании или подскажет служитель.',
  },
  {
    icon: UserPlus,
    title: 'Откройте регистрацию',
    text: 'Придумайте логин и пароль — ни почты, ни лишних данных не нужно.',
  },
  {
    icon: KeyRound,
    title: 'Введите код церкви',
    text: 'Готово — вы внутри и можете начинать читать.',
  },
];

/**
 * Секция «Как начать». При включённой регистрации (`isRegisterEnabled()`) —
 * три шага по коду церкви + CTA «Зарегистрироваться» (→ /register). При выключенной —
 * invite-модель: шаги по личной ссылке + CTA в поддержку (graceful fallback).
 */
export const HowToStart: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;
  const registerEnabled = isRegisterEnabled();
  const steps = registerEnabled ? CHURCH_CODE_STEPS : INVITE_STEPS;

  return (
    <section className="py-16 sm:py-20" data-landing-how-to-start>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-[clamp(28px,4vw,40px)] font-medium leading-tight tracking-[-0.02em] text-app-text">
          Как начать
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-app-text-secondary">
          {registerEnabled
            ? 'Нужен код церкви. Три шага, и вы читаете.'
            : 'Доступ — по приглашению от церкви. Три шага, и вы читаете.'}
        </p>
      </div>

      <motion.ol
        className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-3 lg:gap-6"
        variants={revealContainer}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={revealViewport}
      >
        {steps.map(({ icon: Icon, title, text }, i) => (
          <motion.li
            key={title}
            variants={revealItem}
            className="relative rounded-3xl border border-app-border bg-app-surface/70 p-6 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:p-7"
          >
            <span className="absolute right-6 top-6 font-serif text-3xl font-medium text-app-text-subtle">
              {i + 1}
            </span>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-app-text text-app-text-inverse">
              <Icon size={22} strokeWidth={2} />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-app-text">{title}</h3>
            <p className="mt-2 leading-relaxed text-app-text-secondary">{text}</p>
          </motion.li>
        ))}
      </motion.ol>

      <div className="mt-10 flex justify-center">
        {registerEnabled ? <RegisterButton /> : <AccessButton label="Написать в поддержку" />}
      </div>
    </section>
  );
};
