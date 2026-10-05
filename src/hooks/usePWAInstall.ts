'use client';

import { useCallback, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Состояние — на уровне модуля, а не компонента: `beforeinstallprompt` приходит ОДИН раз
// за загрузку страницы. С локальным useState событие, пойманное на /login, терялось
// бы после клиентской навигации в дашборд — плашка установки там не получила бы кнопку.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let attached = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function attach() {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    console.debug('[pwa] beforeinstallprompt captured');
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

// Слушатель вешаем при импорте модуля — до гидрации, чтобы не пропустить ранний prompt.
attach();

function subscribe(listener: () => void) {
  attach();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Хук для PWA install-prompt. `canInstall` true, когда браузер предложил установку
 * (Android/Chrome). На iOS событие не приходит — установка через «Поделиться → На экран Домой».
 */
export function usePWAInstall() {
  const canInstall = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const isInstalled = useSyncExternalStore(subscribe, () => installed, () => false);

  const install = useCallback(async () => {
    const event = deferred;
    if (!event) return false;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      console.debug('[pwa] install outcome', outcome);
      return outcome === 'accepted';
    } catch (err) {
      console.warn('[pwa] install prompt failed', err);
      return false;
    } finally {
      // prompt() одноразовый: повторный вызов на том же событии бросает.
      deferred = null;
      emit();
    }
  }, []);

  return { canInstall, installed: isInstalled, install };
}
