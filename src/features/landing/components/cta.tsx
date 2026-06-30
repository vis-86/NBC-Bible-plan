'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { SUPPORT_CONTACT } from '@/lib/constants';
import { isRegisterEnabled } from '@/shared/utils/constants';

/**
 * Общие CTA лендинга. Две кнопки переиспользуются в Hero / HowToStart / FinalCta,
 * поэтому вынесены сюда (DRY) с единой высотой и фокус-кольцом.
 *
 * Примечание: «Получить доступ» — это внешняя ссылка в поддержку, поэтому это
 * `<a target="_blank" rel="noopener noreferrer">`, а не `<button>`. Стиль чёрной
 * первичной кнопки совпадает с вариантом `inverse` дизайн-системного `Button`.
 */

const PILL_BASE =
  'inline-flex items-center justify-center gap-2.5 rounded-full font-semibold ' +
  'transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-app-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg ' +
  'motion-reduce:transition-none motion-reduce:active:scale-100';

const PILL_SIZE = 'px-7 py-3.5 text-[15px]';

interface AccessButtonProps {
  className?: string;
  label?: string;
}

/** Чёрная первичная CTA → ссылка в поддержку за invite-приглашением. */
export const AccessButton: React.FC<AccessButtonProps> = ({ className = '', label = 'Получить доступ' }) => (
  <a
    href={SUPPORT_CONTACT}
    target="_blank"
    rel="noopener noreferrer"
    className={
      `group ${PILL_BASE} ${PILL_SIZE} bg-app-text text-app-text-inverse ` +
      'shadow-[0_12px_30px_-8px_rgba(28,25,23,0.5)] hover:-translate-y-0.5 ' +
      'hover:shadow-[0_18px_40px_-10px_rgba(28,25,23,0.55)] motion-reduce:hover:translate-y-0 ' +
      className
    }
    data-landing-access-btn
  >
    {label}
    <ArrowRight
      size={18}
      className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
    />
  </a>
);

interface RegisterButtonProps {
  className?: string;
  label?: string;
}

/**
 * Чёрная первичная CTA → внутренняя навигация на /register (самостоятельная
 * регистрация по коду церкви). Стиль совпадает с AccessButton, но это `<button>`
 * с router.push (внутренний маршрут), а не внешняя ссылка.
 */
export const RegisterButton: React.FC<RegisterButtonProps> = ({ className = '', label = 'Зарегистрироваться' }) => {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push('/register')}
      className={
        `group ${PILL_BASE} ${PILL_SIZE} bg-app-text text-app-text-inverse ` +
        'shadow-[0_12px_30px_-8px_rgba(28,25,23,0.5)] hover:-translate-y-0.5 ' +
        'hover:shadow-[0_18px_40px_-10px_rgba(28,25,23,0.55)] motion-reduce:hover:translate-y-0 ' +
        className
      }
      data-landing-register-btn
    >
      {label}
      <ArrowRight
        size={18}
        className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      />
    </button>
  );
};

interface PrimaryCtaProps {
  className?: string;
}

/**
 * Первичная CTA лендинга, зависящая от флага самостоятельной регистрации:
 * включена — «Зарегистрироваться» (→ /register); выключена — «Получить доступ»
 * (→ поддержка, invite-fallback). Используется в Hero и FinalCta.
 */
export const PrimaryCta: React.FC<PrimaryCtaProps> = ({ className = '' }) =>
  isRegisterEnabled() ? <RegisterButton className={className} /> : <AccessButton className={className} />;

interface LoginButtonProps {
  className?: string;
}

/** Вторичная призрачная кнопка «Войти» → внутренняя навигация на /login. */
export const LoginButton: React.FC<LoginButtonProps> = ({ className = '' }) => {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push('/login')}
      className={
        `${PILL_BASE} ${PILL_SIZE} border border-app-border bg-app-surface/50 text-app-text ` +
        'backdrop-blur hover:-translate-y-0.5 hover:bg-app-surface motion-reduce:hover:translate-y-0 ' +
        className
      }
      data-landing-login-btn
    >
      Войти
    </button>
  );
};
