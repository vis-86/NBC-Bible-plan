import { test, expect, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { appPath, login } from '../offline/helpers';

/**
 * Регрессия на «свайп глав и песен не работает на Android».
 *
 * Баг: глобальное правило `globals.css` выдавало ЛЮБОМУ скролл-контейнеру
 * `touch-action: pan-x pan-y`. Chrome считает эффективный touch-action по цепочке
 * до БЛИЖАЙШЕГО скролл-контейнера, поэтому `pan-y` на `[data-swipe-pager]` (он выше
 * по дереву) до вложенного `.overflow-y-auto` не доходил: браузер видел разрешённый
 * `pan-x`, забирал жест себе примерно через 20px и присылал `pointercancel`.
 * `SwipePager` получал dx≈20 при пороге 60 и молча откатывался.
 *
 * Ловится ТОЛЬКО настоящим тачем в настоящем движке: jsdom-тесты `SwipePager`
 * синтезируют pointer-события сами и про touch-action ничего не знают.
 */

const CHAPTER_URL = '/dashboard/read?book=Бытие&chapter=2';

let storageState: Awaited<ReturnType<BrowserContext['storageState']>>;

/** Мобильный контур: реальный тач нужен, чтобы браузер вообще применял touch-action. */
async function touchContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ ...devices['Pixel 7'], storageState });
}

/**
 * Тач-свайп через CDP: `page.touchscreen` умеет только tap, а нам нужен именно
 * поток touchmove — на нём браузер и принимает решение «это скролл, забираю жест».
 */
async function swipe(
  context: BrowserContext,
  page: Page,
  { x, y, dx, dy = 0, steps = 20, stepDelayMs = 16 }: { x: number; y: number; dx: number; dy?: number; steps?: number; stepDelayMs?: number }
): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + dx * t, y: y + dy * t, id: 1 }],
    });
    await page.waitForTimeout(stepDelayMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function openChapter(page: Page): Promise<void> {
  await page.goto(appPath(CHAPTER_URL));
  await expect(page.locator('[data-testid="reading-header"]')).toBeVisible();
  await expect(page.locator('[data-swipe-pager]')).toBeVisible();
}

function chapterOf(page: Page): string | null {
  return new URL(page.url()).searchParams.get('chapter');
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  storageState = await context.storageState();
  await context.close();
});

test('свайп влево/вправо переключает главу (тач, мобильный контур)', async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await openChapter(page);

  await swipe(context, page, { x: 195, y: 500, dx: -200 });
  await expect.poll(() => chapterOf(page), { message: 'свайп влево → следующая глава' }).toBe('3');

  await swipe(context, page, { x: 195, y: 500, dx: 200 });
  await expect.poll(() => chapterOf(page), { message: 'свайп вправо → предыдущая глава' }).toBe('2');

  await context.close();
});

test('вертикальный скролл главы жестом не сломан', async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await openChapter(page);

  const scrollTop = () =>
    page.evaluate(() => document.querySelector('[data-swipe-pager] .overflow-y-auto')?.scrollTop ?? -1);
  expect(await scrollTop()).toBe(0);

  await swipe(context, page, { x: 195, y: 600, dx: 0, dy: -300 });
  await expect.poll(scrollTop, { message: 'вертикальный жест обязан остаться нативным скроллом' }).toBeGreaterThan(0);
  expect(chapterOf(page), 'вертикальный жест не должен переключать главу').toBe('2');

  await context.close();
});
