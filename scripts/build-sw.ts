import { build } from 'esbuild';
import { injectManifest } from '@serwist/build';
import path from 'path';

/**
 * Бандлит `src/sw/sw.ts` esbuild'ом (classic script, без модульного SW —
 * `ServiceWorkerRegistrar` регистрирует его без `type: 'module'`) и инжектит
 * precache-манифест поверх собранного `out/` (`next build` + `build-manifest.ts`
 * должны отработать раньше — см. порядок в package.json "build").
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/app';
const outDir = path.join(process.cwd(), 'out');
const swPath = path.join(outDir, 'sw.js');

/** Только для версии имени precache-кеша в рантайме SW — не обязана совпадать с NEXT_PUBLIC_APP_BUILD_TIME. */
const swBuild = new Date().toISOString();

/** Защита от случайного попадания тяжёлых данных (Писание — 14 MB — лежит в data/ на BFF, не в out/). */
const SIZE_WARN_BYTES = 15 * 1024 * 1024;

async function main() {
  await build({
    entryPoints: ['src/sw/sw.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    outfile: swPath,
    define: {
      __BASE_PATH__: JSON.stringify(basePath),
      __SW_BUILD__: JSON.stringify(swBuild),
    },
    logLevel: 'silent',
  });

  const { count, size, warnings } = await injectManifest({
    swSrc: swPath,
    swDest: swPath,
    globDirectory: outDir,
    globPatterns: ['**/*.{html,js,css,json,svg,png,webp,woff2,txt,webmanifest}'],
    globIgnores: ['sw.js'],
  });

  for (const warning of warnings) console.warn(`[build-sw] ${warning}`);

  const mb = size / (1024 * 1024);
  console.log(`[build-sw] wrote ${swPath}: ${count} precache entries, ${mb.toFixed(2)} MB (build ${swBuild})`);
  if (size > SIZE_WARN_BYTES) {
    console.warn(`[build-sw] precache size ${mb.toFixed(2)} MB exceeds 15 MB budget — check for accidentally bundled large data`);
  }
}

main().catch((err) => {
  console.error('[build-sw] failed', err);
  process.exit(1);
});
