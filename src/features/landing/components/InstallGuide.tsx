'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Download,
  Share,
  SquarePlus,
  Smartphone,
  ShieldCheck,
  Compass,
  Chrome,
  MoreVertical,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useIsStandalone } from '@/shared/hooks/useIsStandalone';
import { getBasePath } from '@/lib/utils';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/components/ui/Button';
import { revealItem, revealViewport } from './anim';

/** iOS UA sniff — только чтобы выбрать вкладку по умолчанию (какая платформа актуальна для гостя). */
function useIsIOSUserAgent(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => /iphone|ipad|ipod/i.test(window.navigator.userAgent),
    () => false,
  );
}

type Platform = 'ios' | 'android';

interface InstallStep {
  icon: LucideIcon;
  title: string;
  text: string;
}

const IOS_STEPS: InstallStep[] = [
  {
    icon: Compass,
    title: 'Откройте этот сайт в Safari',
    text: 'Safari — стандартный браузер iPhone, синий значок с компасом. Из других браузеров установка не работает.',
  },
  {
    icon: Share,
    title: 'Нажмите «Поделиться»',
    text: 'Квадрат со стрелкой вверх — внизу экрана, по центру панели Safari.',
  },
  {
    icon: SquarePlus,
    title: 'Выберите «На экран „Домой“»',
    text: 'Прокрутите список вниз — пункт с иконкой плюса в квадрате.',
  },
  {
    icon: CheckCircle2,
    title: 'Нажмите «Добавить»',
    text: 'Готово: иконка приложения появится на главном экране, как у обычного приложения.',
  },
];

const ANDROID_STEPS: InstallStep[] = [
  {
    icon: Chrome,
    title: 'Откройте этот сайт в Chrome',
    text: 'Chrome — стандартный браузер Android, разноцветный круглый значок.',
  },
  {
    icon: MoreVertical,
    title: 'Нажмите меню — три точки',
    text: 'Они находятся в правом верхнем углу браузера.',
  },
  {
    icon: Download,
    title: 'Выберите «Установить приложение»',
    text: 'В некоторых версиях пункт называется «Добавить на главный экран».',
  },
  {
    icon: CheckCircle2,
    title: 'Подтвердите установку',
    text: 'Готово: иконка приложения появится на главном экране.',
  },
];

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

/**
 * Секция «Установите на телефон» (PWA): переключатель iPhone/Android
 * (вкладка по умолчанию — платформа гостя по UA), подробные пронумерованные
 * шаги крупным текстом и — если записаны — видео-инструкции
 * `public/landing/install-ios.mp4` / `install-android.mp4`.
 * На Android с доступным `beforeinstallprompt` показываем кнопку установки
 * в один тап вместо ручных шагов. Если приложение уже установлено — секция скрыта.
 */
export const InstallGuide: React.FC = () => {
  const { canInstall, installed, install } = usePWAInstall();
  const isStandalone = useIsStandalone();
  const isIOS = useIsIOSUserAgent();
  const reduceMotion = useReducedMotion() ?? false;
  const [platform, setPlatform] = useState<Platform | null>(null);

  if (installed || isStandalone) return null;

  const active: Platform = platform ?? (isIOS ? 'ios' : 'android');
  const steps = active === 'ios' ? IOS_STEPS : ANDROID_STEPS;
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
            Это займёт меньше минуты. Приложение появится на экране телефона —
            и будет работать даже без интернета.
          </p>
        </div>

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
                  Ваш браузер поддерживает установку в один тап. Иконка сразу появится на экране.
                </p>
                <Button variant="inverse" size="lg" onClick={handleInstall} className="mt-6 inline-flex items-center gap-2.5">
                  <Download size={20} strokeWidth={2} />
                  Установить приложение
                </Button>
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {steps.map(({ icon: Icon, title, text }, i) => (
                  <li
                    key={title}
                    className="flex items-start gap-4 rounded-app-xl border border-app-border bg-app-surface px-5 py-4 text-left shadow-app-sm"
                  >
                    <span className="relative mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-app-md bg-app-primary-light text-app-primary">
                      <Icon size={20} strokeWidth={2} />
                      <span className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-app-text text-[11px] font-bold text-app-text-inverse">
                        {i + 1}
                      </span>
                    </span>
                    <span>
                      <span className="block text-[16px] font-semibold leading-snug text-app-text">{title}</span>
                      <span className="mt-1 block text-[14.5px] leading-relaxed text-app-text-secondary">{text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Видео-инструкция (появляется, только если файл существует) */}
          <InstallVideo platform={active} />
        </div>

        <p className="mx-auto mt-8 flex max-w-md items-center justify-center gap-2 text-sm text-app-text-muted">
          <ShieldCheck size={16} strokeWidth={2.2} className="shrink-0 text-app-success" />
          Бесплатно. App Store и Google Play не нужны.
        </p>
      </motion.div>
    </section>
  );
};
