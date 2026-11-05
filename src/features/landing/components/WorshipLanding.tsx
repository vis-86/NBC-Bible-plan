'use client';

import React from 'react';
import { getBasePath } from '@/lib/utils';
import { getAppBrand, getAppIconsPath } from '@/shared/config/appMode';
import { Atmosphere } from './Atmosphere';
import { InstallGuide } from './InstallGuide';
import { LoginButton } from './cta';

/**
 * Лендинг витрины worship (`NEXT_PUBLIC_APP_MODE=worship`): название, «Войти» и установка PWA.
 * Без регистрации, плана чтения и текстов церкви — доступ только по приглашению.
 */
export const WorshipLanding: React.FC = () => {
  const brand = getAppBrand();

  return (
    <div className="relative min-h-screen overflow-x-clip bg-app-bg text-app-text" data-worship-landing>
      <Atmosphere />
      <div className="relative z-[2] mx-auto w-full max-w-[1200px] px-5 sm:px-7">
        <main>
          <section className="flex flex-col items-center py-20 text-center sm:py-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${getAppIconsPath(getBasePath())}/icon-192.png`}
              alt=""
              aria-hidden
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-2xl shadow-[0_6px_18px_rgba(79,70,229,0.25)]"
            />
            <h1 className="mt-6 font-serif text-[clamp(36px,6vw,60px)] font-medium leading-[1.05] tracking-[-0.02em] text-app-text">
              {brand.name}
            </h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-app-text-secondary">
              Песни и сеты вашей команды — всегда под рукой, даже без интернета. Доступ по приглашению.
            </p>
            <LoginButton className="mt-8" />
          </section>
          <InstallGuide />
        </main>
      </div>
    </div>
  );
};
