'use client';

import React, { useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Download, Share, SquarePlus, Smartphone, ShieldCheck } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useIsStandalone } from '@/shared/hooks/useIsStandalone';
import { Button } from '@/shared/components/ui/Button';
import { revealItem, revealViewport } from './anim';

/** iOS UA sniff — только чтобы решить порядок карточек (какая платформа актуальна для гостя). */
function useIsIOSUserAgent(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => /iphone|ipad|ipod/i.test(window.navigator.userAgent),
    () => false,
  );
}

const AndroidCard: React.FC<{ canInstall: boolean; onInstall: () => void }> = ({ canInstall, onInstall }) => (
  <div className="flex flex-1 flex-col items-center rounded-2xl border border-app-border bg-app-bg/60 px-6 py-7 text-center">
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-app-primary-light text-app-primary">
      <Smartphone size={22} strokeWidth={2} />
    </span>
    <h3 className="mt-4 text-base font-semibold text-app-text">Android</h3>
    {canInstall ? (
      <>
        <p className="mt-1.5 text-sm text-app-text-secondary">Одна кнопка — и иконка на экране</p>
        <Button variant="inverse" size="lg" onClick={onInstall} className="mt-5 inline-flex items-center gap-2.5">
          <Download size={20} strokeWidth={2} />
          Установить
        </Button>
      </>
    ) : (
      <p className="mt-1.5 text-sm text-app-text-secondary">
        Откройте план в Chrome — браузер предложит установку
      </p>
    )}
  </div>
);

const IOSCard: React.FC = () => (
  <div className="flex flex-1 flex-col items-center rounded-2xl border border-app-border bg-app-bg/60 px-6 py-7 text-center">
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-app-primary-light text-app-primary">
      <Share size={22} strokeWidth={2} />
    </span>
    <h3 className="mt-4 text-base font-semibold text-app-text">iPhone / iPad</h3>
    <ol className="mt-4 flex w-full flex-col gap-2.5 text-left">
      <li className="flex items-center gap-3 rounded-xl bg-app-surface/70 px-3.5 py-3">
        <Share size={18} strokeWidth={2} className="shrink-0 text-app-primary" />
        <span className="text-sm text-app-text">
          {'Нажмите '}
          <span className="font-semibold">«Поделиться»</span>
        </span>
      </li>
      <li className="flex items-center gap-3 rounded-xl bg-app-surface/70 px-3.5 py-3">
        <SquarePlus size={18} strokeWidth={2} className="shrink-0 text-app-primary" />
        <span className="text-sm text-app-text">
          {'Выберите '}
          <span className="font-semibold">{'«На экран „Домой"»'}</span>
        </span>
      </li>
    </ol>
  </div>
);

/**
 * Секция-ценность «Установите как приложение» (PWA): своя иконка, запуск в одно
 * касание, работает офлайн. Две карточки — Android/iOS — актуальная платформа
 * гостя (по UA) идёт первой. Android с `canInstall` получает кнопку `install()`,
 * иначе (или iOS) — инструкция «Поделиться → На экран „Домой"». Если приложение
 * уже установлено/запущено как standalone — секция скрывается целиком.
 */
export const InstallGuide: React.FC = () => {
  const { canInstall, installed, install } = usePWAInstall();
  const isStandalone = useIsStandalone();
  const isIOS = useIsIOSUserAgent();
  const reduceMotion = useReducedMotion() ?? false;

  if (installed || isStandalone) return null;

  const handleInstall = async () => {
    console.debug('[pwa] install click');
    await install();
  };

  const androidCard = <AndroidCard key="android" canInstall={canInstall} onInstall={handleInstall} />;
  const iosCard = <IOSCard key="ios" />;
  const cards = isIOS ? [iosCard, androidCard] : [androidCard, iosCard];

  return (
    <section id="install" className="scroll-mt-24 py-16 sm:py-20" data-landing-install>
      <motion.div
        className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-app-border bg-app-surface/70 p-8 text-center shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-12"
        variants={revealItem}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={revealViewport}
      >
        <h2 className="font-serif text-[clamp(26px,3.5vw,36px)] font-medium leading-tight tracking-[-0.02em] text-app-text">
          Установите как приложение
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-app-text-secondary">
          Своя иконка на экране, запуск в одно касание, работает без интернета.
        </p>

        <div className="mx-auto mt-8 flex max-w-xl flex-col gap-4 sm:flex-row">{cards}</div>

        <p className="mx-auto mt-6 flex max-w-md items-center justify-center gap-2 text-sm text-app-text-muted">
          <ShieldCheck size={16} strokeWidth={2.2} className="shrink-0 text-app-success" />
          Бесплатно, без магазина приложений
        </p>
      </motion.div>
    </section>
  );
};
