import { NextResponse } from 'next/server';
import { buildSwBody } from '@/sw/sw-source';

/**
 * Service worker, отдаваемый по `{basePath}/sw.js`.
 * Раздача из-под basePath даёт SW scope = `{basePath}/` по умолчанию — это нужно для
 * деплоя за nginx с basePath `/app` (public/-ассеты лежат в корне и недоступны под /app).
 *
 * App-shell SW: cache-first для `_next/static/**`, NetworkFirst для HTML-навигаций,
 * passthrough для всего остального (см. `src/sw/sw-source.ts`).
 */
export async function GET() {
  return new NextResponse(buildSwBody(), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Service-Worker-Allowed': process.env.NEXT_PUBLIC_BASE_PATH || '/',
    },
  });
}
