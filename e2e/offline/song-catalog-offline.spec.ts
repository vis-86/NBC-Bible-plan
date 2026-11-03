import { test, expect } from '@playwright/test';
import { appPath, login, waitForServiceWorkerReady } from './helpers';

/**
 * Каталог песен — online-only (осознанное исключение из offline-first). Офлайн экран
 * открывается из app-shell и честно говорит «нужен интернет», без ошибок в консоли.
 */
test('каталог офлайн — «доступен только с интернетом», консоль чистая', async ({ page, context }) => {
  await login(page);
  await waitForServiceWorkerReady(page);
  await page.goto(appPath('/dashboard/songs'));
  await expect(page.locator('[data-songs-page]')).toBeVisible({ timeout: 15_000 });
  await page.close();

  const errors: string[] = [];
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  offlinePage.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('Failed to fetch RSC payload')) errors.push(msg.text());
  });
  await offlinePage.goto(appPath('/dashboard/catalog'));

  await expect(offlinePage.locator('[data-song-catalog-offline]')).toContainText('доступен только с интернетом', {
    timeout: 20_000,
  });
  expect(errors).toEqual([]);

  await context.setOffline(false);
});
