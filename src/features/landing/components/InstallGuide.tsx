'use client';

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Download, Smartphone, ShieldCheck, MessageCircle } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useIsStandalone } from '@/shared/hooks/useIsStandalone';
import { useInstallEnv } from '@/shared/components/pwa/useInstallEnv';
import {
  getInstallInstructions,
  getOpenInBrowserInstructions,
} from '@/shared/components/pwa/installInstructions';
import { CopySiteLink, InstallSteps } from '@/shared/components/pwa/InstallSteps';
import { getBasePath } from '@/lib/utils';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/components/ui/Button';
import { revealItem, revealViewport } from './anim';

type Platform = 'ios' | 'android';

/**
 * Видео-инструкция записи экрана (если Игорь положил файл в public/landing/).
 * Файла может не быть — тогда блок тихо схлопывается (`onError`), а шаги
 * занимают всю ширину. Autoplay: muted + playsInline + loop, без звука.
 */
const InstallVideo: React.FC<{ platform: Platform }> = ({ platform }) => {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const basePath = getBasePath();

  if (failed) return null;

  return (
    <div
      className={cn(
        'mx-auto w-[230px] shrink-0 overflow-hidden rounded-[32px] border-[6px] border-app-text bg-app-surface-muted shadow-app-card',
        !ready && 'hidden',
      )}
    >
      <video
        key={platform}
        src={`${basePath}/landing/install-${platform}.mp4`}
        className="aspect-[9/19.5] w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedData={() => setReady(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
};

const PlatformTab: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'inline-flex min-h-11 items-center gap-2 rounded-full px-6 py-2.5 text-[15px] font-semibold transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary/40',
      active
        ? 'bg-app-text text-app-text-inverse shadow-app-sm'
        : 'text-app-text-secondary hover:text-app-text',
    )}
  >
    {children}
  </button>
);

/** Сайт открыт внутри мессенджера: установка оттуда невозможна — сначала в браузер. */
const OpenInBrowserCard: React.FC<{ os: 'ios' | 'android' | 'other' }> = ({ os }) => (
  <div className="mx-auto mt-10 w-full max-w-md" data-landing-install-in-app>
    <div className="mb-5 flex items-start gap-3 rounded-app-xl border border-app-accent/40 bg-app-accent-light px-5 py-4 text-left">
      <MessageCircle size={20} strokeWidth={2.2} className="mt-0.5 shrink-0 text-app-accent" />
      <p className="text-[15px] leading-relaxed text-app-text">
        Похоже, сайт открыт внутри мессенджера. Отсюда установить нельзя —
        сначала откройте его в {os === 'android' ? 'Chrome' : 'Safari'}.
      </p>
    </div>
    <InstallSteps instructions={getOpenInBrowserInstructions(os)} />
    <CopySiteLink className="mt-6" />
  </div>
);

/**
 * Секция «Установите на телефон» (PWA): переключатель iPhone/Android
 * (вкладка по умолчанию — платформа гостя по UA), подробные пронумерованные
 * шаги крупным текстом под браузер гостя и — если записаны — видео-инструкции
 * `public/landing/install-ios.mp4` / `install-android.mp4`.
 * На Android с доступным `beforeinstallprompt` показываем кнопку установки
 * в один тап вместо ручных шагов. Во встроенном браузере мессенджера — сначала
 * «откройте в браузере». Если приложение уже установлено — секция скрыта.
 */
export const InstallGuide: React.FC = () => {
  const { canInstall, installed, install } = usePWAInstall();
  const isStandalone = useIsStandalone();
  const env = useInstallEnv();
  const reduceMotion = useReducedMotion() ?? false;
  const [platform, setPlatform] = useState<Platform | null>(null);

  if (installed || isStandalone) return null;

  const active: Platform = platform ?? (env?.os === 'ios' ? 'ios' : 'android');
  // Браузер гостя учитываем, только если вкладка — его платформа; иначе стандартный браузер платформы.
  const browser = env && env.os === active ? env.browser : active === 'ios' ? 'safari' : 'chrome';
  const showOneTapInstall = active === 'android' && canInstall;

  const handleInstall = async () => {
    console.debug('[pwa] install click');
    await install();
  };

  return (
    <section id="install" className="scroll-mt-24 py-16 sm:py-24" data-landing-install>
      <motion.div
        variants={revealItem}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={revealViewport}
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-app-primary">
            Установка
          </p>
          <h2 className="mt-3 font-serif text-[clamp(30px,4.5vw,46px)] font-medium leading-[1.1] tracking-[-0.02em] text-app-text">
            Установите на телефон
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-app-text-secondary">
            Скачивать из магазина ничего не нужно — приложение ставится прямо с этого сайта
            за полминуты. На экране появится иконка, и всё будет работать даже без интернета.
          </p>
        </div>

        {env?.inApp ? (
          <OpenInBrowserCard os={env.os} />
        ) : (
          <>
            {/* Переключатель платформ */}
            <div className="mt-8 flex justify-center">
              <div className="inline-flex rounded-full border border-app-border bg-app-surface p-1 shadow-app-sm">
                <PlatformTab active={active === 'ios'} onClick={() => setPlatform('ios')}>
                  <Smartphone size={17} strokeWidth={2.2} />
                  iPhone
                </PlatformTab>
                <PlatformTab active={active === 'android'} onClick={() => setPlatform('android')}>
                  <Smartphone size={17} strokeWidth={2.2} />
                  Android
                </PlatformTab>
              </div>
            </div>

            <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-10 sm:flex-row sm:items-start sm:justify-center">
              {/* Шаги */}
              <div className="w-full max-w-md flex-1">
                {showOneTapInstall ? (
                  <div className="flex flex-col items-center rounded-app-card border border-app-border bg-app-surface px-6 py-10 text-center shadow-app-md">
                    <span className="grid h-14 w-14 place-items-center rounded-app-lg bg-app-primary-light text-app-primary">
                      <Download size={26} strokeWidth={2} />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold text-app-text">Одна кнопка — и готово</h3>
                    <p className="mt-2 max-w-[32ch] text-app-text-secondary">
                      Ваш браузер умеет ставить приложение в одно касание. Иконка сразу появится на экране.
                    </p>
                    <Button variant="inverse" size="lg" onClick={handleInstall} className="mt-6 inline-flex items-center gap-2.5">
                      <Download size={20} strokeWidth={2} />
                      Установить приложение
                    </Button>
                  </div>
                ) : (
                  <InstallSteps instructions={getInstallInstructions(active, browser)} />
                )}
              </div>

              {/* Видео-инструкция (появляется, только если файл существует).
                  key: сбрасываем failed/ready при смене вкладки — иначе 404 одной
                  платформы навсегда прятал бы видео другой. */}
              <InstallVideo key={active} platform={active} />
            </div>
          </>
        )}

        <p className="mx-auto mt-8 flex max-w-md items-center justify-center gap-2 text-sm text-app-text-muted">
          <ShieldCheck size={16} strokeWidth={2.2} className="shrink-0 text-app-success" />
          Бесплатно. App Store и Google Play не нужны.
        </p>
      </motion.div>
    </section>
  );
};
