import { test, expect } from '@playwright/test';
import { login, warmAppShell } from './helpers';

/**
 * T9 сценарий 3: outbox sync. Офлайн переключить пункт чтения (TodayReadingCard
 * checkbox) → оптимистичный UI → онлайн → health-gated replay outbox (T5) →
 * после reload отметка сохранилась на сервере. В конце восстанавливаем исходное
 * состояние пункта (тест гоняется на реальном аккаунте — не должен оставлять след).
 */
test('offline progress toggle syncs to server after reconnect', async ({ page, context }) => {
  await login(page);
  await warmAppShell(page);

  const checkbox = page.locator('[data-today-reading-card-item-checkbox]').first();
  await expect(checkbox).toBeVisible();
  const wasChecked = await checkbox.isChecked();

  await context.setOffline(true);
  await checkbox.click();
  await expect(checkbox).toBeChecked({ checked: !wasChecked });

  const graphqlSync = page.waitForResponse(
    (res) => res.url().includes('/api/graphql') && res.request().method() === 'POST',
    { timeout: 15_000 }
  );
  await context.setOffline(false);
  await graphqlSync;

  await page.reload();
  const reloadedCheckbox = page.locator('[data-today-reading-card-item-checkbox]').first();
  await expect(reloadedCheckbox).toBeChecked({ checked: !wasChecked });

  // Восстанавливаем исходное состояние — тест гоняется на реальном аккаунте.
  const restoreSync = page.waitForResponse(
    (res) => res.url().includes('/api/graphql') && res.request().method() === 'POST',
    { timeout: 15_000 }
  );
  await reloadedCheckbox.click();
  await restoreSync;
  await expect(reloadedCheckbox).toBeChecked({ checked: wasChecked });
});
