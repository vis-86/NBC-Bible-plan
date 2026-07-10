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

/**
 * Офлайн-переход обязан остаться КЛИЕНТСКОЙ (SPA) навигацией, без сетевого запроса.
 *
 * Тест выше проходил и с багом: `context.setOffline(true)` отклоняет fetch мгновенно,
 * Next ловит ошибку RSC-запроса и делает hard-навигацию (MPA), а её SW обслуживает из
 * precache. На устройстве же реальный офлайн не отклоняет запрос, а ВЕШАЕТ его —
 * `catch` не срабатывает, MPA-фолбэк не наступает, кнопка не делает ничего.
 * Эмулировать зависание нельзя: Playwright `route` не перехватывает запросы,
 * прошедшие через service worker. Поэтому ловим баг по наблюдаемому следствию —
 * произошёл ли MPA-фолбэк. Две независимых проверки: маркер на `window` (переживает
 * SPA-переход, умирает при перезагрузке документа) и отсутствие RSC-ошибки в консоли.
 */
test('offline navigation stays a client-side transition (no RSC network fallback)', async ({
  page,
  context,
}) => {
  await login(page);
  await warmAppShell(page);

  await context.setOffline(true);
  await expect(page.locator('[data-today-reading-card]')).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__spaMarker = true;
  });

  const rscErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().includes('Failed to fetch RSC payload')) rscErrors.push(msg.text());
  });

  await page.locator('[data-dashboard-nav-item="bible"]').click();
  await expect(page.locator('[data-testid="reading-header"]')).toBeVisible();

  const survivedNavigation = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__spaMarker
  );
  expect(survivedNavigation, 'документ перезагрузился → переход ушёл в MPA-фолбэк').toBe(true);
  expect(rscErrors, 'RSC-пейлоад запрашивался по сети вместо precache').toEqual([]);

  await context.setOffline(false);
});
