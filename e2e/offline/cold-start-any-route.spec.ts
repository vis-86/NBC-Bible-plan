import { test, expect } from '@playwright/test';
import { appPath, login, waitForServiceWorkerReady } from './helpers';

/**
 * T13 killer-фича precache (`.ai-factory/plans/feature-static-export-hono-bff.md`):
 * с runtime-кешем (до T8) не посещённый маршрут офлайн падал в fallback — теперь
 * ВЕСЬ app-shell (все HTML-роуты) precache'ится атомарно при установке SW, поэтому
 * маршрут, который пользователь никогда не открывал онлайн, тоже рендерится офлайн.
 *
 * Не переиспользует `warmAppShell()` — он посещает dashboard/read/songs, что сделало
 * бы /dashboard/calendar «уже посещённым» и не проверяло бы precache-гарантию.
 */
test('offline direct navigation to a never-visited route renders from precache', async ({ page, context }) => {
  // scheduleEnsureOfflineData() запускается один раз из AuthProvider сразу после
  // server-confirmed логина (см. autoDownload.ts) — подписываемся на console ДО
  // login(), иначе рискуем пропустить событие. Дальнейший page.goto() убил бы
  // JS-контекст и запланированный idle-таймер, поэтому НЕ навигируем повторно —
  // login() уже приземляет на /dashboard клиентским роутингом.
  const autoDownloadDone = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('auto-download finished'),
    timeout: 20_000,
  });
  await login(page);
  await waitForServiceWorkerReady(page);
  await expect(page.locator('[data-today-reading-card]')).toBeVisible({ timeout: 15_000 });
  await autoDownloadDone;
  await page.close();

  await context.setOffline(true);
  const offlinePage = await context.newPage();
  await offlinePage.goto(appPath('/dashboard/calendar'));

  await expect(offlinePage.locator('[data-day-nav-cube]').first()).toBeVisible({ timeout: 15_000 });
  await expect(offlinePage.getByText('Нет соединения')).not.toBeVisible();

  await context.setOffline(false);
});
