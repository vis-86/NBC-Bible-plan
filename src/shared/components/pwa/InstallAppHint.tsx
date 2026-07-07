'use client';

import React from 'react';
import { Download, Share, Smartphone, SquarePlus } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useIsStandalone } from '@/shared/hooks/useIsStandalone';
import { isTelegramWebApp } from '@/lib/telegram';

/**
 * Компактная PWA-подсказка под формами входа/регистрации — для гостей, которые
 * пришли по прямой ссылке мимо лендинга (там установка не была показана вообще).
 * Скрыта в standalone/installed и в Telegram mini-app (там она неуместна).
 * Сдержанный стиль: не конкурирует с формой визуально.
 */
export const InstallAppHint: React.FC = () => {
  const { canInstall, installed, install } = usePWAInstall();
  const isStandalone = useIsStandalone();

  if (installed || isStandalone || isTelegramWebApp()) return null;

  const handleInstall = async () => {
    console.debug('[pwa] install click (auth hint)');
    await install();
  };

  if (canInstall) {
    return (
      <div
        className="mt-6 flex items-center justify-center gap-3 text-sm text-app-text-secondary"
        data-install-app-hint
      >
        <span>Удобнее в приложении</span>
        <button
          type="button"
          onClick={handleInstall}
          className="inline-flex items-center gap-1.5 rounded-full border border-app-border px-3 py-1.5 font-semibold text-app-text transition-colors hover:bg-app-surface"
          data-install-app-hint-install-btn
        >
          <Download size={14} strokeWidth={2.2} />
          Установить
        </button>
      </div>
    );
  }

  return (
    <details className="mt-6 text-sm text-app-text-secondary" data-install-app-hint>
      <summary className="flex cursor-pointer items-center justify-center gap-1.5 font-semibold text-app-text">
        <Smartphone size={15} strokeWidth={2.2} />
        Установить как приложение
      </summary>
      <div className="mt-3 flex items-center justify-center gap-2 text-app-text-secondary">
        <Share size={15} strokeWidth={2.2} className="shrink-0" />
        <span>Поделиться</span>
        <span aria-hidden>→</span>
        <SquarePlus size={15} strokeWidth={2.2} className="shrink-0" />
        <span>{'На экран „Домой"'}</span>
      </div>
    </details>
  );
};
