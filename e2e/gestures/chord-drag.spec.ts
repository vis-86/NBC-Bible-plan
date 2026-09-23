import { test, expect, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { appPath, login } from '../offline/helpers';

/**
 * Гейт перетаскивания аккорда в редакторе песни (M9, T3c).
 *
 * Класс багов тот же, что у `swipe-pager.spec.ts` и `pull-to-refresh.spec.ts`: если
 * браузер сочтёт жест своим (прокрутка), он пришлёт `pointercancel` примерно через
 * 20px, и аккорд молча вернётся на место. Держит это `touch-action: none` на самом
 * аккорде; jsdom этого не видит — нужен настоящий тач в настоящем движке.
 *
 * Роль `musician_editor` подменяется ответом `/api/user/role` (SW заблокирован, иначе
 * `route` не видит запросы), запись песни — заглушкой: прод-каталог тест не трогает.
 */

const SONG_URL = '/dashboard/song-edit?id=1';

let storageState: Awaited<ReturnType<BrowserContext['storageState']>>;

async function editorContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ ...devices['Pixel 7'], storageState, serviceWorkers: 'block' });
  await context.route('**/api/user/role', (route) => route.fulfill({ json: { role: 'musician_editor' } }));
  await context.route('**/api/songs**', (route) =>
    ['POST', 'PUT'].includes(route.request().method()) ? route.fulfill({ status: 500, json: { error: 'e2e stub' } }) : route.continue()
  );
  return context;
}

/** Тач-протяжка через CDP: `page.touchscreen` умеет только tap, а решение браузер принимает на touchmove. */
async function touchDrag(
  context: BrowserContext,
  page: Page,
  { x, y, dx, dy = 0, steps = 20, stepDelayMs = 16 }: { x: number; y: number; dx: number; dy?: number; steps?: number; stepDelayMs?: number }
): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * t, y: y + dy * t, id: 1 }] });
    await page.waitForTimeout(stepDelayMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(appPath(SONG_URL));
  await expect(page.locator('[data-song-chord-canvas]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __chordCancels: number };
    w.__chordCancels = 0;
    document.addEventListener('pointercancel', () => (w.__chordCancels += 1), true);
  });
}

/** Первый аккорд над строкой со словами (не в цепочке вступления). */
function firstLyricChip(page: Page) {
  return page.locator('[data-song-chord-canvas-lyric-line] > [data-song-chord-canvas-chip]').first();
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  storageState = await context.storageState();
  await context.close();
});

test('аккорд тянется пальцем вдоль строки и встаёт на новое место (тач, мобильный контур)', async ({ browser }) => {
  const context = await editorContext(browser);
  const page = await context.newPage();
  await openEditor(page);

  const chip = firstLyricChip(page);
  await chip.scrollIntoViewIfNeeded();
  const before = (await chip.boundingBox())!;
  const label = (await chip.textContent())!;

  await touchDrag(context, page, { x: before.x + before.width / 2, y: before.y + before.height / 2, dx: 120 });

  expect(await page.evaluate(() => (window as unknown as { __chordCancels: number }).__chordCancels), 'браузер не должен забирать жест').toBe(0);
  const moved = page.locator('[data-song-chord-canvas-chip][aria-pressed="true"]');
  await expect(moved, 'перетащенный аккорд выбран').toHaveText(label);
  await expect.poll(async () => (await moved.boundingBox())!.x, { message: 'аккорд уехал вправо' }).toBeGreaterThan(before.x + 80);
  await expect(page.locator('[data-song-chord-keyboard-undo]'), 'перенос — это правка, её можно отменить').toBeVisible();

  await context.close();
});

test('вертикальный жест по тексту песни по-прежнему прокручивает редактор', async ({ browser }) => {
  const context = await editorContext(browser);
  const page = await context.newPage();
  await openEditor(page);

  const scroller = () => page.evaluate(() => document.querySelector('[data-song-editor] .overflow-y-auto')?.scrollTop ?? -1);
  const start = await scroller();
  const text = page.locator('[data-song-chord-canvas-lyric-line] > span').nth(2);
  const box = (await text.boundingBox())!;

  await touchDrag(context, page, { x: box.x + 40, y: box.y + box.height / 2, dx: 0, dy: -250 });

  await expect.poll(scroller, { message: 'touch-action: none стоит только на аккордах, не на тексте' }).toBeGreaterThan(start);
  await expect(page.locator('[data-song-chord-keyboard-undo]'), 'прокрутка ничего не правит').toHaveCount(0);

  await context.close();
});
