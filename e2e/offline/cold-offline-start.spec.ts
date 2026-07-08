import { test, expect } from '@playwright/test';
import { appPath, login, warmAppShell } from './helpers';

/**
 * T9 сценарий 1: cold offline start. Логин + прогрев онлайн → закрыть страницу →
 * офлайн → открыть /dashboard заново → рендерится контент, НЕ offline-fallback
 * ("Нет соединения") и НЕ белый экран.
 */
test('cold offline start renders dashboard from cache', async ({ page, context }) => {
  await login(page);
  await warmAppShell(page);
  await page.close();

  await context.setOffline(true);
  const offlinePage = await context.newPage();
  await offlinePage.goto(appPath('/dashboard'));

  await expect(offlinePage.locator('[data-today-reading-card]')).toBeVisible();
  await expect(offlinePage.getByText('Нет соединения')).not.toBeVisible();

  await context.setOffline(false);
});
