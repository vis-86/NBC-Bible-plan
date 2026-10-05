'use client';

import React, { useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useIsStandalone } from '@/shared/hooks/useIsStandalone';
import { isTelegramWebApp } from '@/lib/telegram';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { useInstallEnv } from './useInstallEnv';
import { useInstallBannerSnooze } from './installBannerSnooze';
import { getInstallInstructions, getOpenInBrowserInstructions } from './installInstructions';
import { CopySiteLink, InstallSteps } from './InstallSteps';

/**
 * Плашка «Установите приложение» сверху главной, когда приложением пользуются
 * из вкладки браузера. На Android с готовым prompt — установка в один тап, иначе
 * шторка с пошаговой инструкцией под платформу (или «откройте в браузере» для
 * встроенного браузера мессенджера). «Не сейчас» прячет плашку на 7 дней.
 */
export const InstallBanner: React.FC = () => {
  const { canInstall, installed, install } = usePWAInstall();
  const isStandalone = useIsStandalone();
  const env = useInstallEnv();
  const [snoozed, snooze] = useInstallBannerSnooze();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!env || installed || isStandalone || snoozed || isTelegramWebApp()) return null;
  // Десктоп без prompt'а: шаги — про телефон, плашка там только мешает.
  if (env.os === 'other' && !canInstall) return null;

  const oneTap = canInstall && !env.inApp;

  const handleAction = async () => {
    if (oneTap) {
      console.debug('[pwa] install click (dashboard banner)');
      await install();
      return;
    }
    setSheetOpen(true);
  };

  const platform = env.os === 'ios' ? 'ios' : 'android';
  const instructions = env.inApp
    ? getOpenInBrowserInstructions(env.os)
    : getInstallInstructions(platform, env.browser);

  return (
    <>
      <div
        className="mx-4 mt-3 flex items-center gap-3 rounded-app-xl border border-app-border bg-app-surface py-3 pl-3 pr-2 shadow-app-sm"
        data-install-banner
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-app-md bg-app-primary-light text-app-primary">
          <Smartphone size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-app-text">Установите приложение</p>
          <p className="text-xs leading-snug text-app-text-secondary">
            {env.inApp ? 'Сначала откройте сайт в браузере' : 'Иконка на экране и работа без интернета'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleAction}
          className="shrink-0 rounded-full bg-app-text px-4 py-2 text-sm font-semibold text-app-text-inverse transition-opacity active:opacity-80"
          data-install-banner-action
        >
          {oneTap ? 'Установить' : 'Как?'}
        </button>
        <button
          type="button"
          onClick={snooze}
          aria-label="Не сейчас"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-app-text-muted transition-colors hover:text-app-text"
          data-install-banner-dismiss
        >
          <X size={18} strokeWidth={2.2} />
        </button>
      </div>

      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={env.inApp ? 'Откройте в браузере' : 'Как установить'}
      >
        <div className="pb-4" data-install-banner-sheet>
          <InstallSteps instructions={instructions} />
          {env.inApp && <CopySiteLink className="mt-5" />}
          {!env.inApp && env.os === 'ios' && (
            // На iPhone хранилище Safari и установленного приложения раздельные — сессия не переедет.
            <p className="mt-4 text-center text-sm text-app-text-muted">
              После установки войдите в приложении ещё раз — на iPhone браузер и приложение помнят вход отдельно.
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  );
};
