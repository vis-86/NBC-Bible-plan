import fs from 'fs';
import path from 'path';
import { buildWebManifest } from '../src/shared/config/appMode';

/**
 * Порт src/app/manifest.ts (Next MetadataRoute.Manifest route handler, несовместим
 * со static export) — генерирует статический public/manifest.webmanifest, который
 * export кладёт в out/ как обычный статический файл. Подключается в layout.tsx через
 * `metadata.manifest`. start_url ведёт на dashboard (гейтится клиентским auth-guard,
 * T7 — незалогиненного редиректнет на /login); в режиме worship — на /dashboard/songs.
 * Содержимое по режиму — `buildWebManifest` в src/shared/config/appMode.ts.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const manifest = buildWebManifest(basePath);

const outPath = path.join(process.cwd(), 'public', 'manifest.webmanifest');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`[build-manifest] wrote ${outPath}`);
