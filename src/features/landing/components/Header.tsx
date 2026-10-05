'use client';

import React from 'react';
import { getBasePath } from '@/lib/utils';
import { LoginButton, RegisterButton } from './cta';
import { isRegisterEnabled } from '@/shared/utils/constants';

/**
 * Лёгкий sticky-хедер лендинга: лого + название церкви, «Войти» и (при открытой регистрации)
 * «Создать аккаунт» — шапка sticky, так что путь новичка виден на любой высоте длинного лендинга.
 * На узких экранах название прячется: две кнопки рядом с ним не помещаются, бренд есть в Hero.
 */
export const Header: React.FC = () => {
  const basePath = getBasePath();

  return (
    <header
      className="sticky top-0 z-30 border-b border-app-border/60 bg-app-bg/75 backdrop-blur-md"
      data-landing-header
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${basePath}/icons/icon-192.png`}
            alt=""
            aria-hidden
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl shadow-[0_6px_18px_rgba(79,70,229,0.25)]"
          />
          <div className={isRegisterEnabled() ? 'hidden leading-tight sm:block' : 'leading-tight'}>
            <p className="text-[15px] font-semibold tracking-tight text-app-text">План чтения Библии</p>
            <p className="mt-0.5 text-xs font-medium text-app-text-muted">Нижегородская Библейская Церковь</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <LoginButton className="!px-4 !py-2.5 !text-sm sm:!px-5" />
          {isRegisterEnabled() && (
            <RegisterButton className="!gap-1.5 !px-4 !py-2.5 !text-sm !shadow-none sm:!px-5" />
          )}
        </div>
      </div>
    </header>
  );
};
