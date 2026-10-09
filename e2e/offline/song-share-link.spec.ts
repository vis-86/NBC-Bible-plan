import { test, expect } from '@playwright/test';
import { appPath, login, waitForServiceWorkerReady } from './helpers';

/**
 * Ссылка «Поделиться» `/s?id=`. Гость видит открытую песню (онлайн — осознанное исключение
 * из offline-first: у гостя нет ни сессии, ни IDB); вошедший даже офлайн уходит в
 * `/dashboard/song`, который читает песню из IDB. Песня 1 корпуса открыта всем (дефолт).
 */
const SONG_ID = '1';

test('гость открывает ссылку — лист песни без сессии, консоль без ошибок', async ({ browser }) => {
  const guest = await browser.newContext();
  const page = await guest.newPage();
  const errors: string[] = [];
  let themeBootstrap401 = 0;
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  // Бутстрап темы (`ThemeProvider`) у гостя честно получает 401 от `/api/user/app-settings` —
  // как на /login; браузер пишет это в консоль. Других ошибок быть не должно.
  page.on('response', (res) => {
    if (res.status() === 401 && res.url().includes('/api/user/app-settings')) themeBootstrap401 += 1;
  });

  await page.goto(appPath(`/s?id=${SONG_ID}`));

  await expect(page.locator('[data-public-song]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-public-song-page] h1')).not.toHaveText('Песня');
  expect(page.url()).toContain('/s?id=');
  const unexpected = errors.filter((text) => !text.includes('status of 401'));
  expect(unexpected).toEqual([]);
  // 401 в консоли допустим, только если это ровно бутстрап темы.
  expect(errors.length - unexpected.length).toBeLessThanOrEqual(themeBootstrap401);
  await guest.close();
});

test('вошедший офлайн по ссылке попадает в песню из IDB', async ({ page, context }) => {
  await login(page);
  await waitForServiceWorkerReady(page);
  // Песня читается read-through — открытие онлайн кладёт её в IDB.
  await page.goto(appPath(`/dashboard/song?id=${SONG_ID}`));
  await expect(page.locator('[data-song-page-stage]')).toBeVisible({ timeout: 15_000 });
  await page.close();

  const rscErrors: string[] = [];
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  offlinePage.on('console', (msg) => {
    if (msg.text().includes('Failed to fetch RSC payload')) rscErrors.push(msg.text());
  });
  await offlinePage.goto(appPath(`/s?id=${SONG_ID}`));

  await offlinePage.waitForURL(`**${appPath(`/dashboard/song?id=${SONG_ID}`)}`, { timeout: 20_000 });
  await expect(offlinePage.locator('[data-song-page-stage]')).toBeVisible({ timeout: 15_000 });
  expect(rscErrors).toEqual([]);

  await context.setOffline(false);
});
