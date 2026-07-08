'use client';

import { useSyncExternalStore } from 'react';

/**
 * Модульный store для состояния «обновление SW готово» — ServiceWorkerRegistrar
 * пишет в него из своих подписок на registration.waiting/updatefound, UpdateToast
 * читает через useSwUpdate(). Модульный store (а не React context), потому что
 * источник события — не React-дерево, а browser API (ServiceWorkerRegistration),
 * с которым уже есть только один продюсер (ServiceWorkerRegistrar, монтируется
 * один раз в root layout).
 */
let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Вызывается ServiceWorkerRegistrar, когда найден waiting-воркер новой версии. */
export function setWaitingWorker(worker: ServiceWorker | null): void {
  waitingWorker = worker;
  notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): boolean {
  return waitingWorker !== null;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Чистая функция решения «новый SW готов к применению» — тестируется отдельно
 * от event-подписок. installed + уже есть controller = не первая установка,
 * а waiting-воркер новой версии поверх старой.
 */
export function isUpdateReady(newWorkerState: string, hasController: boolean): boolean {
  return newWorkerState === 'installed' && hasController;
}

/**
 * Чистая функция решения «нужно ли перезагрузить страницу по controllerchange».
 * hadController — snapshot ДО подписки (первая установка меняет controller
 * null → SW и тоже шлёт controllerchange, это не должно триггерить reload).
 * reloaded — once-guard против повторных controllerchange.
 */
export function shouldReloadOnControllerChange(hadController: boolean, reloaded: boolean): boolean {
  return hadController && !reloaded;
}

/** Состояние обновления SW + действие «применить» для UpdateToast. */
export function useSwUpdate(): { updateReady: boolean; applyUpdate: () => void } {
  const updateReady = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    updateReady,
    applyUpdate: () => {
      if (!waitingWorker) return;
      console.debug('[UpdateToast] applyUpdate — postMessage SKIP_WAITING');
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    },
  };
}
