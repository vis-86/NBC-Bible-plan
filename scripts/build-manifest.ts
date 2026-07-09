import fs from 'fs';
import path from 'path';

/**
 * Порт src/app/manifest.ts (Next MetadataRoute.Manifest route handler, несовместим
 * со static export) — генерирует статический public/manifest.webmanifest, который
 * export кладёт в out/ как обычный статический файл. Подключается в layout.tsx через
 * `metadata.manifest`. start_url ведёт на dashboard (гейтится клиентским auth-guard,
 * T7 — незалогиненного редиректнет на /login).
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const manifest = {
  name: 'NBC Bible Plan',
  short_name: 'Bible Plan',
  description: 'План чтения Библии Нижегородской Библейской Церкви',
  start_url: `${basePath}/dashboard`,
  scope: `${basePath}/`,
  display: 'standalone',
  background_color: '#ffffff',
  // = светлый --app-bg: дефолтный цвет брови до гидрации (runtime-цвет
  // ставит statusBarColor); Android берёт отсюда тинт при запуске.
  theme_color: '#FAFAF9',
  orientation: 'portrait-primary',
  lang: 'ru',
  icons: [
    { src: `${basePath}/icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

const outPath = path.join(process.cwd(), 'public', 'manifest.webmanifest');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`[build-manifest] wrote ${outPath}`);
