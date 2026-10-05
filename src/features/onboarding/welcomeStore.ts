'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Флаг «показать приветствие на главной». Ставится ТОЛЬКО при успешной регистрации, поэтому
 * давние пользователи карточку не видят. Ключ — единственный источник для писателя
 * (`/register`) и читателя (`WelcomeCard`).
 */
export const WELCOME_PENDING_KEY = 'onboarding-welcome-pending';

export function markWelcomePending(): void {
  try {
    window.localStorage.setItem(WELCOME_PENDING_KEY, '1');
  } catch (err) {
    // Приватный режим и т.п. — приветствие не критично, регистрация важнее.
    console.warn('[onboarding] cannot persist welcome flag', err);
  }
}

function isWelcomePending(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
let sessionDismissed = false;

export function dismissWelcome(): void {
  try {
    window.localStorage.removeItem(WELCOME_PENDING_KEY);
  } catch (err) {
    console.warn('[onboarding] cannot clear welcome flag', err);
  }
  // Прячем в текущей сессии в любом случае, даже если стереть флаг не удалось.
  sessionDismissed = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** [показывать ли приветствие, «Понятно»]. При пререндере — скрыто, чтобы не мигало до гидрации. */
export function useWelcome(): [boolean, () => void] {
  const pending = useSyncExternalStore(
    subscribe,
    () => !sessionDismissed && isWelcomePending(),
    () => false,
  );
  const dismiss = useCallback(() => dismissWelcome(), []);
  return [pending, dismiss];
}

/** Только для тестов: сбросить состояние модуля между кейсами. */
export function resetWelcomeSessionForTests(): void {
  sessionDismissed = false;
}
