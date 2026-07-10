'use client';

import { useEffect } from 'react';
import { getBasePath } from '@/shared/utils/api';
import { setWaitingWorker, isUpdateReady, shouldReloadOnControllerChange } from '@/shared/hooks/useSwUpdate';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Регистрирует service worker (`{basePath}/sw.js`) на клиенте.
 * Без UI — монтируется один раз в layout. UI обновления (тост) — UpdateToast,
 * читает состояние через useSwUpdate().
 *
 * Помимо register() дергает reg.update() при возврате вкладки в фокус и раз в час —
 * иначе браузер годами не подтянет новую версию SW (включая kill switch из
 * src/sw/sw.ts), пока пользователь не закроет все вкладки вручную.
 *
 * Update flow (T1 убрал skipWaiting() из install): новый SW встаёт в waiting →
 * пользователь подтверждает тостом → applyUpdate() шлёт SKIP_WAITING →
 * controllerchange → reload.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const basePath = getBasePath();
    const swUrl = `${basePath}/sw.js`;

    // Snapshot ДО подписки на controllerchange: первая установка SW тоже меняет
    // controller null → SW и шлёт controllerchange — это не апдейт, reload не нужен.
    const hadController = navigator.serviceWorker.controller != null;
    let reloaded = false;

    const onControllerChange = () => {
      if (shouldReloadOnControllerChange(hadController, reloaded)) {
        reloaded = true;
        console.debug('[SW] controllerchange → reloading');
        window.location.reload();
      } else {
        console.debug('[SW] controllerchange on first install — skip reload');
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let reg: ServiceWorkerRegistration | undefined;

    navigator.serviceWorker
      .register(swUrl, { scope: `${basePath}/` })
      .then((registration) => {
        reg = registration;
        console.debug('[SW] registered', registration.scope);

        if (registration.waiting) {
          console.debug('[SW] update ready (waiting worker found)');
          setWaitingWorker(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            console.debug('[SW] updatefound → ' + newWorker.state);
            if (isUpdateReady(newWorker.state, navigator.serviceWorker.controller != null)) {
              setWaitingWorker(newWorker);
            }
          });
        });
      })
      .catch((err) => console.debug('[SW] registration failed', err));

    const checkForUpdate = () => {
      reg?.update().catch((err) => console.debug('[SW] update check failed', err));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    const intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
