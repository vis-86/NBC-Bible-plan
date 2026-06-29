import type { MetadataRoute } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * Web App Manifest. Next App Router отдаёт его на `{basePath}/manifest.webmanifest`.
 * start_url ведёт на dashboard (защищён middleware — незалогиненного редиректнет на /login).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NBC Bible Plan',
    short_name: 'Bible Plan',
    description: 'План чтения Библии Нижегородской Библейской Церкви',
    start_url: `${basePath}/dashboard`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1f2937',
    orientation: 'portrait-primary',
    lang: 'ru',
    icons: [
      { src: `${basePath}/icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
