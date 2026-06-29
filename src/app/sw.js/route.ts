import { NextResponse } from 'next/server';

/**
 * Service worker, отдаваемый по `{basePath}/sw.js`.
 * Раздача из-под basePath даёт SW scope = `{basePath}/` по умолчанию — это нужно для
 * деплоя за nginx с basePath `/app` (public/-ассеты лежат в корне и недоступны под /app).
 *
 * Минимальный SW: install/activate + passthrough fetch (нужно для install-prompt в Chrome).
 * Offline-кеширование — вне scope (можно добавить позже).
 */
const SW_SOURCE = `
self.addEventListener('install', (event) => {
  self.skipWaiting();
  console.log('[SW] installing');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  console.log('[SW] activated');
});

// Passthrough fetch — наличие обработчика требуется для установки PWA в Chrome.
self.addEventListener('fetch', () => {});
`;

export async function GET() {
  return new NextResponse(SW_SOURCE, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Service-Worker-Allowed': process.env.NEXT_PUBLIC_BASE_PATH || '/',
    },
  });
}
