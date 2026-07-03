'use client';

import { useEffect } from 'react';
import { getBasePath } from '@/shared/utils/api';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Регистрирует service worker (`{basePath}/sw.js`) на клиенте.
 * Без UI — монтируется один раз в layout.
 *
 * Помимо register() дергает reg.update() при возврате вкладки в фокус и раз в час —
 * иначе браузер годами не подтянет новую версию SW (включая kill switch из
 * src/sw/sw-source.ts), пока пользователь не закроет все вкладки вручную.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const basePath = getBasePath();
    const swUrl = `${basePath}/sw.js`;

    let reg: ServiceWorkerRegistration | undefined;

    navigator.serviceWorker
      .register(swUrl, { scope: `${basePath}/` })
      .then((registration) => {
        reg = registration;
        console.debug('[SW] registered', registration.scope);
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
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
