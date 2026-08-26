import { test, expect, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { appPath, login } from '../offline/helpers';

/**
 * Регрессия на «поправил лист пальцем — автоскролл выключился».
 *
 * Ручной подскролл во время автоскролла обязан лишь ПРИОСТАНАВЛИВАТЬ движок: подправить
 * положение песни пальцем — обычная часть чтения на служении, и требовать за это
 * повторного нажатия кнопки нельзя (§8 спеки).
 *
 * Настоящий тач нужен по существу: путь `touchstart → touchmove → touchend` с инерцией
 * воспроизводит только реальный движок, а wheel-кейс (`e2e/layout/song-autoscroll.spec.ts`)
 * проходит другой ветвью слушателей.
 */

let storageState: Awaited<ReturnType<BrowserContext['storageState']>>;
let songId: string;

async function touchContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ ...devices['Pixel 7'], storageState });
}

/** Вертикальный тач-драг через CDP: нужен именно поток touchmove, а не tap. */
async function dragVertically(
  context: BrowserContext,
  page: Page,
  { x, y, dy, steps = 10, stepDelayMs = 16 }: { x: number; y: number; dy: number; steps?: number; stepDelayMs?: number },
): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + (dy * i) / steps, id: 1 }],
    });
    await page.waitForTimeout(stepDelayMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function scrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-song-view]')?.closest<HTMLElement>('.overflow-y-auto');
    return scroller ? Math.round(scroller.scrollTop) : -1;
  });
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  await page.goto(appPath('/dashboard/songs'));
  const card = page.locator('[data-song-card]').first();
  await card.waitFor({ state: 'visible', timeout: 15_000 });
  songId = (await card.getAttribute('data-song-card-item')) as string;
  expect(songId, 'первая карточка песни должна нести data-song-card-item').toBeTruthy();
  storageState = await context.storageState();
  await context.close();
});

test('ручной тач-скролл приостанавливает автоскролл, и движок едет дальше сам', async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await page.goto(appPath(`/dashboard/song?id=${encodeURIComponent(songId)}`));
  await page.locator('[data-song-view]').waitFor({ state: 'visible', timeout: 15_000 });

  const toggle = page.locator('[data-song-autoscroll-toggle]');
  await toggle.waitFor({ state: 'visible', timeout: 10_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Пауза автоскролла');
  await expect.poll(async () => scrollTop(page), { timeout: 5_000, intervals: [200, 200, 300] }).toBeGreaterThan(0);

  // Подправили положение листа пальцем (тянем вверх — лист едет вниз).
  await dragVertically(context, page, { x: 200, y: 400, dy: -120 });

  // Режим остался включённым: кнопка по-прежнему «Пауза», повторно нажимать нечего.
  await expect(toggle).toHaveAttribute('aria-label', 'Пауза автоскролла');
  const afterGesture = await scrollTop(page);

  // …и через паузу движок продолжил с новой позиции.
  await expect
    .poll(async () => scrollTop(page), { timeout: 6_000, intervals: [400, 400, 600] })
    .toBeGreaterThan(afterGesture + 1);

  await context.close();
});
