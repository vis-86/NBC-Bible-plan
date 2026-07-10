import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { appPath, login, waitForServiceWorkerReady } from './helpers';

/**
 * Update flow (T1: install БЕЗ skipWaiting → waiting SW → тост → SKIP_WAITING →
 * controllerchange → reload). Симулирует передеплой, дописывая безвредный байт в
 * конец собранного `out/sw.js` (браузер сравнивает SW побайтово — этого достаточно,
 * чтобы он счёл файл новой версией), без реальной пересборки/передеплоя.
 *
 * Восстанавливает исходные байты `sw.js` в конце теста — важно, если `out/` не
 * пересобирается заново перед следующим прогоном (see e2e/offline/README.md).
 */
test('update toast appears after a new SW deploy, apply reloads to the new version', async ({ page }) => {
  const swPath = path.join(process.cwd(), 'out', 'sw.js');
  const originalBytes = fs.readFileSync(swPath);

  try {
    await login(page);
    await waitForServiceWorkerReady(page);
    await page.goto(appPath('/dashboard'));
    await expect(page.locator('[data-today-reading-card]')).toBeVisible({ timeout: 15_000 });

    // Симулируем передеплой: новая версия sw.js на "сервере" (out/), вкладка ещё
    // не знает об этом, пока не вызовем reg.update() — как в проде на visibilitychange/раз в час.
    fs.writeFileSync(swPath, Buffer.concat([originalBytes, Buffer.from(`\n// e2e-update-flow-${Date.now()}\n`)]));

    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });

    await expect(page.locator('[data-update-toast]')).toBeVisible({ timeout: 15_000 });

    const reloaded = page.waitForNavigation();
    await page.locator('[data-update-toast-apply]').click();
    await reloaded;

    // После reload новый SW — активный контроллер, тост скрыт (updateReady сброшен),
    // старый precache-кеш (версия по __SW_BUILD__) удалён (см. sw.ts pruneUnknownCaches).
    await expect(page.locator('[data-today-reading-card]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-update-toast]')).not.toBeVisible();

    const cacheNames = await page.evaluate(() => caches.keys());
    expect(cacheNames.filter((name) => name.startsWith('app-shell-precache-'))).toHaveLength(1);
  } finally {
    fs.writeFileSync(swPath, originalBytes);
  }
});
