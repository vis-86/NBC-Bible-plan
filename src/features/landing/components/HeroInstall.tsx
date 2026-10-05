'use client';

import React from 'react';
import { ArrowRight, ChevronRight, Download, MoreVertical, Share, Smartphone, SquarePlus, type LucideIcon } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useIsStandalone } from '@/shared/hooks/useIsStandalone';
import { useInstallEnv } from '@/shared/components/pwa/useInstallEnv';
import { Button } from '@/shared/components/ui/Button';

const Chip: React.FC<{ icon: LucideIcon; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-app-surface-muted px-3 py-1.5 text-[14px] font-semibold text-app-text">
    <Icon size={15} strokeWidth={2.2} className="shrink-0 text-app-primary" />
    {children}
  </span>
);

const Then: React.FC = () => (
  <ChevronRight size={16} strokeWidth={2.4} aria-hidden className="shrink-0 text-app-text-muted" />
);

const GuideLink: React.FC<{ label?: string }> = ({ label = 'Подробная инструкция' }) => (
  <a
    href="#install"
    className="inline-flex items-center gap-1 text-[14px] font-semibold text-app-primary underline-offset-2 hover:underline"
    data-landing-hero-install-guide-link
  >
    {label}
    <ArrowRight size={15} strokeWidth={2.2} />
  </a>
);

/**
 * Акцент «это приложение — ставится с сайта» в первом экране лендинга: стоит
 * ДО кнопок регистрации. Порядок осознанный — на iPhone вход в Safari не переезжает
 * в установленное приложение, поэтому правильный путь «сначала установить, потом войти».
 * Показывает рецепт в одну строку под платформу гостя; подробности — в секции #install.
 */
export const HeroInstall: React.FC = () => {
  const { canInstall, installed, install } = usePWAInstall();
  const isStandalone = useIsStandalone();
  const env = useInstallEnv();

  if (installed || isStandalone) return null;

  const handleInstall = async () => {
    console.debug('[pwa] install click (hero)');
    await install();
  };

  const renderRecipe = () => {
    // До гидрации (пререндер) платформа неизвестна — общий вход в инструкцию.
    if (!env) return <GuideLink label="Как установить — 30 секунд" />;

    if (env.inApp) {
      return (
        <>
          <p className="text-[14px] leading-snug text-app-text-secondary">
            Сейчас сайт открыт внутри мессенджера — для установки откройте его в браузере.
          </p>
          <GuideLink label="Как это сделать" />
        </>
      );
    }

    if (env.os === 'android' && canInstall) {
      return (
        <Button variant="inverse" size="lg" onClick={handleInstall} className="inline-flex items-center gap-2.5" data-landing-hero-install-btn>
          <Download size={19} strokeWidth={2} />
          Установить приложение
        </Button>
      );
    }

    if (env.os === 'ios') {
      return (
        <>
          <div className="flex flex-wrap items-center justify-center gap-1.5" data-landing-hero-install-recipe="ios">
            <Chip icon={Share}>Поделиться</Chip>
            <Then />
            <Chip icon={SquarePlus}>{'На экран «Домой»'}</Chip>
          </div>
          <p className="text-[13px] leading-snug text-app-text-muted">
            {'Не видите «Поделиться»? Нажмите «•••» внизу справа.'}
          </p>
          <GuideLink />
        </>
      );
    }

    if (env.os === 'android') {
      return (
        <>
          <div className="flex flex-wrap items-center justify-center gap-1.5" data-landing-hero-install-recipe="android">
            <Chip icon={MoreVertical}>Меню</Chip>
            <Then />
            <Chip icon={Download}>Установить</Chip>
          </div>
          <GuideLink />
        </>
      );
    }

    return (
      <>
        <p className="text-[14px] leading-snug text-app-text-secondary">
          Откройте этот сайт на телефоне — и установите в пару касаний.
        </p>
        <GuideLink label="Как установить" />
      </>
    );
  };

  return (
    <div
      className="w-full max-w-md rounded-app-card border border-app-border bg-app-surface/85 px-5 pb-5 pt-6 text-center shadow-app-md backdrop-blur"
      data-landing-hero-install
    >
      <div className="flex flex-col items-center">
        <span className="grid h-12 w-12 place-items-center rounded-app-lg bg-app-primary-light text-app-primary">
          <Smartphone size={24} strokeWidth={2} />
        </span>
        <p className="mt-3 text-[17px] font-semibold leading-snug text-app-text">Это приложение для телефона</p>
        <p className="mt-1 max-w-[32ch] text-balance text-[14px] leading-relaxed text-app-text-secondary">
          {'Ставится прямо с\u00A0этого сайта\u00A0— без App\u00A0Store и\u00A0Google\u00A0Play. Работает без интернета.'}
        </p>
      </div>
      <div className="mt-5 flex flex-col items-center gap-2.5 border-t border-app-border pt-4">{renderRecipe()}</div>
    </div>
  );
};
