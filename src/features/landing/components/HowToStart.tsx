'use client';

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Send, Smartphone, KeyRound, Hash, UserPlus, BookOpen, type LucideIcon } from 'lucide-react';
import { AccessButton, RegisterButton } from './cta';
import { isRegisterEnabled, isRegisterCodeRequired } from '@/shared/utils/constants';
import { revealContainer, revealItem, revealViewport } from './anim';

interface Step {
  icon: LucideIcon;
  title: string;
  text: string;
  /** Якорь вместо статичной карточки (например, скролл к секции установки). */
  href?: string;
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

/** Шаги открытой регистрации без кода церкви (прод с 2026-07-01, см. isRegisterCodeRequired()). */
const NO_CODE_STEPS: Step[] = [
  {
    icon: Smartphone,
    title: 'Установите на телефон',
    text: 'Иконка на экране, запуск в одно касание — и офлайн работает стабильно.',
    href: '#install',
  },
  {
    icon: KeyRound,
    title: 'Придумайте логин и пароль',
    text: 'Ни почты, ни лишних данных — регистрация в одну форму.',
  },
  {
    icon: BookOpen,
    title: 'Читайте в своём ритме',
    text: 'Начинайте с любого дня — план подстроится под вас.',
  },
];

/**
 * Секция «Как начать». При включённой регистрации (`isRegisterEnabled()`) — три
 * шага, содержание которых зависит от `isRegisterCodeRequired()` (код церкви
 * нужен/не нужен — прод с 2026-07-01 работает без кода) + CTA «Зарегистрироваться»
 * (→ /register). При выключенной регистрации — invite-модель: шаги по личной
 * ссылке + CTA в поддержку (graceful fallback).
 */
export const HowToStart: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;
  const registerEnabled = isRegisterEnabled();
  const codeRequired = isRegisterCodeRequired();
  const steps = registerEnabled ? (codeRequired ? CHURCH_CODE_STEPS : NO_CODE_STEPS) : INVITE_STEPS;

  return (
    <section className="py-16 sm:py-24" data-landing-how-to-start>
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-app-primary">
          Три шага
        </p>
        <h2 className="mt-3 font-serif text-[clamp(30px,4.5vw,46px)] font-medium leading-[1.1] tracking-[-0.02em] text-app-text">
          Как начать
        </h2>
        {(!registerEnabled || codeRequired) && (
          <p className="mt-4 text-lg leading-relaxed text-app-text-secondary">
            {registerEnabled
              ? 'Нужен код церкви. Три шага, и вы читаете.'
              : 'Доступ — по приглашению от церкви. Три шага, и вы читаете.'}
          </p>
        )}
      </div>

      <motion.ol
        className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-3 lg:gap-6"
        variants={revealContainer}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={revealViewport}
      >
        {steps.map(({ icon: Icon, title, text, href }, i) => {
          const cardClassName =
            'relative h-full rounded-app-card border border-app-border bg-app-surface p-6 shadow-app-sm sm:p-7' +
            (href ? ' block transition-shadow hover:shadow-app-md' : '');
          const content = (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-app-text-muted">
                Шаг {i + 1}
              </p>
              <div className="mt-4 grid h-12 w-12 place-items-center rounded-app-lg bg-app-primary-light text-app-primary">
                <Icon size={22} strokeWidth={2} />
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-app-text">{title}</h3>
              <p className="mt-2 leading-relaxed text-app-text-secondary">{text}</p>
            </>
          );

          return (
            <motion.li key={title} variants={revealItem} className="h-full">
              {href ? (
                <a href={href} className={cardClassName}>
                  {content}
                </a>
              ) : (
                <div className={cardClassName}>{content}</div>
              )}
            </motion.li>
          );
        })}
      </motion.ol>

      <div className="mt-10 flex justify-center">
        {registerEnabled ? <RegisterButton /> : <AccessButton label="Написать в поддержку" />}
      </div>
    </section>
  );
};
