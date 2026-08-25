import { test, expect, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { appPath, login } from '../offline/helpers';

/**
 * Регрессия на «pull-to-refresh не работает на Android».
 *
 * Баг того же класса, что и в `swipe-pager.spec.ts`: скролл-контейнеру достаётся
 * `touch-action: pan-x pan-y`, Chrome опознаёт вертикальный жест как свой скролл
 * (даже когда прокручивать некуда — `scrollTop === 0`), забирает его и присылает
 * `pointercancel`. Хук `usePullToRefresh` не добирает свои 64px и молча ничего не
 * делает — со стороны «свайп вниз не обновляет».
 *
 * Ловится ТОЛЬКО настоящим тачем: jsdom-тесты хука синтезируют pointer-события
 * сами и про touch-action / нативный скролл ничего не знают.
 */

let storageState: Awaited<ReturnType<BrowserContext['storageState']>>;

async function touchContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ ...devices['Pixel 7'], storageState });
}

/** Тач-жест через CDP: `page.touchscreen` умеет только tap, а решение «это скролл» браузер принимает на потоке touchmove. */
async function swipe(
  context: BrowserContext,
  page: Page,
  { x, y, dx = 0, dy, steps = 20, stepDelayMs = 16 }: { x: number; y: number; dx?: number; dy: number; steps?: number; stepDelayMs?: number }
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

async function openSetlists(page: Page): Promise<void> {
  await page.goto(appPath('/dashboard/setlists'));
  await expect(page.locator('[data-pull-to-refresh]')).toBeVisible();
  // Список должен успеть отрисоваться: скелетон высотой меньше экрана не даёт скролла.
  await expect(page.locator('[data-setlists-loading]')).toHaveCount(0, { timeout: 15_000 });
}

const phaseOf = (page: Page) =>
  page.locator('[data-pull-to-refresh]').getAttribute('data-pull-to-refresh-phase');

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  storageState = await context.storageState();
  await context.close();
});

test('протягивание вниз от верха списка запускает обновление (тач, мобильный контур)', async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await openSetlists(page);

  const phases: string[] = [];
  const collect = setInterval(() => {
    void phaseOf(page)
      .then((p) => {
        if (p && phases[phases.length - 1] !== p) phases.push(p);
      })
      .catch(() => {});
  }, 50);

  await swipe(context, page, { x: 195, y: 200, dy: 400 });
  await page.waitForTimeout(600);
  clearInterval(collect);

  expect(phases, 'жест обязан пройти через pulling/armed и уйти в refreshing').toContain('refreshing');

  await context.close();
});

test('протягивание вверх остаётся обычным скроллом', async ({ browser }) => {
  const context = await touchContext(browser);
  const page = await context.newPage();
  await openSetlists(page);

  // Список короче экрана прокручивать нечем — тогда проверяем только, что жест не взвёлся.
  const scrollable = await page.evaluate(() => {
    const n = document.querySelector('[data-pull-to-refresh]') as HTMLElement | null;
    return !!n && n.scrollHeight > n.clientHeight + 50;
  });

  await swipe(context, page, { x: 195, y: 500, dy: -250 });
  await page.waitForTimeout(200);

  expect(await phaseOf(page), 'скролл вверх не должен взводить жест').toBe('idle');
  if (scrollable) {
    const scrollTop = await page.evaluate(
      () => (document.querySelector('[data-pull-to-refresh]') as HTMLElement | null)?.scrollTop ?? -1
    );
    expect(scrollTop, 'вертикальный жест вверх обязан остаться нативным скроллом').toBeGreaterThan(0);
  }

  await context.close();
});
