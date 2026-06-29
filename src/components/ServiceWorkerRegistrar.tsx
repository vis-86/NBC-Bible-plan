'use client';

import { useEffect } from 'react';
import { getBasePath } from '@/shared/utils/api';

/**
 * Регистрирует service worker (`{basePath}/sw.js`) на клиенте.
 * Без UI — монтируется один раз в layout.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const basePath = getBasePath();
    const swUrl = `${basePath}/sw.js`;
    navigator.serviceWorker
      .register(swUrl, { scope: `${basePath}/` })
      .then((reg) => console.debug('[SW] registered', reg.scope))
      .catch((err) => console.debug('[SW] registration failed', err));
  }, []);

  return null;
}
