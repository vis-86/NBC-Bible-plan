'use client';

import { useSyncExternalStore } from 'react';
import { detectInstallEnv, type InstallEnv } from './installEnv';

let cached: InstallEnv | null = null;

function getSnapshot(): InstallEnv {
  // useSyncExternalStore требует стабильную ссылку между вызовами — UA за сессию не меняется.
  cached ??= detectInstallEnv(window.navigator.userAgent, window.navigator.maxTouchPoints ?? 0);
  return cached;
}

const noopSubscribe = () => () => {};

/** Окружение установки на клиенте; `null` при пререндере (static export) — до гидрации ничего не решаем. */
export function useInstallEnv(): InstallEnv | null {
  return useSyncExternalStore(noopSubscribe, getSnapshot, () => null);
}
