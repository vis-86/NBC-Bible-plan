'use client';

import React, { useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/shared/components/ui/Button';
import { revealItem, revealViewport } from './anim';

/** iOS Safari выставляет нестандартный navigator.standalone. */
type IOSNavigator = Navigator & { standalone?: boolean };

const STANDALONE_QUERY = '(display-mode: standalone)';

/**
 * Запущено ли приложение как установленное PWA. Читаем через useSyncExternalStore:
 * SSR-снимок = false (нет hydration-варнинга), на клиенте подписываемся на смену
 * display-mode и учитываем iOS navigator.standalone.
 */
function useIsStandalone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(STANDALONE_QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () =>
      window.matchMedia(STANDALONE_QUERY).matches ||
      (window.navigator as IOSNavigator).standalone === true,
    () => false,
  );
}

/**
 * Секция «Установите на телефон» (PWA). На Android/Chrome (`canInstall`) —
 * кнопка «Установить» через `install()`. На iOS события нет → показываем
 * инструкцию «Поделиться → На экран „Домой"». Если приложение уже установлено
 * или запущено как standalone — секция скрывается целиком.
 */
export const InstallGuide: React.FC = () => {
  const { canInstall, installed, install } = usePWAInstall();
  const isStandalone = useIsStandalone();
  const reduceMotion = useReducedMotion() ?? false;

  if (installed || isStandalone) return null;

  const handleInstall = async () => {
    console.debug('[pwa] install click');
    await install();
  };

  return (
    <section className="py-16 sm:py-20" data-landing-install>
      <motion.div
        className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-app-border bg-app-surface/70 p-8 text-center shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-12"
        variants={revealItem}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={revealViewport}
      >
        <h2 className="font-serif text-[clamp(26px,3.5vw,36px)] font-medium leading-tight tracking-[-0.02em] text-app-text">
          Установите на телефон
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-app-text-secondary">
          Откройте план одним касанием с домашнего экрана — как обычное приложение.
        </p>

        {canInstall ? (
          <div className="mt-8 flex justify-center">
            <Button variant="inverse" size="lg" onClick={handleInstall} className="inline-flex items-center gap-2.5">
              <Download size={20} strokeWidth={2} />
              Установить
            </Button>
          </div>
        ) : (
          <ol className="mx-auto mt-8 flex max-w-md flex-col gap-3 text-left">
            <li className="flex items-center gap-3.5 rounded-2xl border border-app-border bg-app-bg/60 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-app-primary-light text-app-primary">
                <Share size={20} strokeWidth={2} />
              </span>
              <span className="text-app-text">
                {'Нажмите '}
                <span className="font-semibold">«Поделиться»</span>
                {' в браузере'}
              </span>
            </li>
            <li className="flex items-center gap-3.5 rounded-2xl border border-app-border bg-app-bg/60 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-app-primary-light text-app-primary">
                <SquarePlus size={20} strokeWidth={2} />
              </span>
              <span className="text-app-text">
                {'Выберите '}
                <span className="font-semibold">{'«На экран „Домой"»'}</span>
              </span>
            </li>
          </ol>
        )}
      </motion.div>
    </section>
  );
};
