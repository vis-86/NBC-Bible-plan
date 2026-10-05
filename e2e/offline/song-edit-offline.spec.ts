import { test, expect } from '@playwright/test';
import { appPath, login, waitForServiceWorkerReady } from './helpers';

/**
 * M9 T3a: `/dashboard/song-edit` — новый app-shell маршрут. Запись песни online-only,
 * но сам экран офлайн обязан открыться из precache и сказать, почему править нельзя,
 * а не упасть в fallback или в `Failed to fetch RSC payload`.
 *
 * Маршрут онлайн НЕ открывается: проверяется именно precache-гарантия. Тест-аккаунт —
 * `musician`, без права правки песен, поэтому ожидается сообщение о правах; редактор
 * с правами офлайн показал бы «только с интернетом» — это тот же `data-song-edit-message`.
 */
test('офлайн холодный старт на /dashboard/song-edit — экран рендерится, консоль чистая', async ({ page, context }) => {
  await login(page);
  await waitForServiceWorkerReady(page);
  await expect(page.locator('[data-today-reading-card]')).toBeVisible({ timeout: 15_000 });
  await page.close();

  const rscErrors: string[] = [];
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  offlinePage.on('console', (msg) => {
    if (msg.text().includes('Failed to fetch RSC payload')) rscErrors.push(msg.text());
  });
  await offlinePage.goto(appPath('/dashboard/song-edit?id=1'));

  await expect(offlinePage.locator('[data-song-edit-page]')).toBeVisible({ timeout: 15_000 });
  await expect(offlinePage.locator('[data-song-edit-message]')).toBeVisible({ timeout: 15_000 });
  expect(rscErrors).toEqual([]);

  await context.setOffline(false);
});
