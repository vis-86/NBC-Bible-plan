import { test, expect } from '@playwright/test';
import { login, warmAppShell } from './helpers';

/**
 * T9 сценарий 2: офлайн-навигация. Онлайн посетить dashboard/read/songs →
 * офлайн → пройти по разделам через bottom nav → каждый раздел рендерит контент.
 */
test('offline navigation across dashboard/read/songs renders content', async ({ page, context }) => {
  await login(page);
  await warmAppShell(page);

  await context.setOffline(true);

  await expect(page.locator('[data-today-reading-card]')).toBeVisible();

  await page.locator('[data-dashboard-nav-item="bible"]').click();
  await expect(page.locator('[data-testid="reading-header"]')).toBeVisible();

  await page.locator('[data-dashboard-nav-item="songs"]').click();
  await expect(page.locator('[data-songs-page]')).toBeVisible();

  await page.locator('[data-dashboard-nav-item="home"]').click();
  await expect(page.locator('[data-today-reading-card]')).toBeVisible();

  await context.setOffline(false);
});
