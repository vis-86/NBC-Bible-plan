import { Page, expect } from '@playwright/test';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '/app';

export function appPath(path: string): string {
  return `${BASE_PATH}${path}`;
}

export function testCredentials(): { login: string; password: string } {
  const login = process.env.E2E_TEST_LOGIN;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!login || !password) {
    throw new Error(
      'E2E_TEST_LOGIN / E2E_TEST_PASSWORD не заданы — см. e2e/offline/README.md (.env.test)'
    );
  }
  return { login, password };
}

/** Логин через форму + ожидание попадания на /dashboard. */
export async function login(page: Page): Promise<void> {
  const { login: user, password } = testCredentials();
  await page.goto(appPath('/login'));
  await page.getByLabel('Логин').fill(user);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(`**${appPath('/dashboard')}`);
}

/** Дожидается, что SW взял страницу под контроль (навигации из кеша возможны). */
export async function waitForServiceWorkerReady(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active && navigator.serviceWorker.controller != null;
  });
}

/**
 * Прогревает app-shell кеш посещением разделов онлайн (dashboard/read/songs).
 *
 * Каждый `page.goto()` — полная навигация (перезагрузка JS-контекста), поэтому
 * PlanContext/fetchPlan монтируется заново на каждом визите. Дожидаемся рендера
 * плана на КАЖДОМ визите /dashboard (включая последний, после которого тесты сразу
 * уходят в офлайн) — иначе readThrough('plan:days', ...) может не успеть записать
 * ответ в IDB apiCache до ухода со страницы, и офлайн-рендер упадёт в ErrorMessage
 * вместо чтения из кеша.
 */
export async function warmAppShell(page: Page): Promise<void> {
  await page.goto(appPath('/dashboard'));
  await waitForServiceWorkerReady(page);
  await expect(page.locator('[data-today-reading-card]')).toBeVisible({ timeout: 15_000 });
  await page.goto(appPath('/dashboard/read?book=Бытие&chapter=1'));
  await expect(page.locator('[data-testid="reading-header"]')).toBeVisible();
  await page.goto(appPath('/dashboard/songs'));
  await page.goto(appPath('/dashboard'));
  await expect(page.locator('[data-today-reading-card]')).toBeVisible({ timeout: 15_000 });
}
