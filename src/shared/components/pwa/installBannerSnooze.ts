'use client';

import { useCallback, useSyncExternalStore } from 'react';

export const INSTALL_BANNER_SNOOZED_AT_KEY = 'pwa-install-banner-snoozed-at';
export const INSTALL_BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function isInstallBannerSnoozed(now = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(INSTALL_BANNER_SNOOZED_AT_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && now - at < INSTALL_BANNER_SNOOZE_MS;
  } catch {
    // localStorage недоступен (приватный режим) — показываем плашку: лишний показ лучше потерянной подсказки.
    return false;
  }
}

const listeners = new Set<() => void>();
let sessionSnoozed = false;

export function snoozeInstallBanner(now = Date.now()): void {
  try {
    window.localStorage.setItem(INSTALL_BANNER_SNOOZED_AT_KEY, String(now));
  } catch (err) {
    console.warn('[pwa] cannot persist install banner snooze', err);
  }
  // Скрываем в текущей сессии в любом случае, даже если запомнить не удалось.
  sessionSnoozed = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** [скрыта ли плашка, «Не сейчас»]. При пререндере — скрыта, чтобы не мигала до гидрации. */
export function useInstallBannerSnooze(): [boolean, () => void] {
  const snoozed = useSyncExternalStore(
    subscribe,
    () => sessionSnoozed || isInstallBannerSnoozed(),
    () => true,
  );
  const snooze = useCallback(() => snoozeInstallBanner(), []);
  return [snoozed, snooze];
}
