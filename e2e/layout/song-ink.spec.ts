import { test, expect, type Locator, type Page } from '@playwright/test';
import { appPath, login } from '../offline/helpers';

/**
 * Регрессия режима пометок (§6) на реальном прод-контуре: hit-test касаний и
 * геометрию плашки jsdom не воспроизводит.
 *
 * 1. Со второго листа хост слоя уезжает `translateX` за экран — касание ловилось
 *    только поверх строк, пустая колонка последнего листа не рисовалась.
 * 2. Плашка «Отменить/Готово» закрывала первые строки — в режиме над листом
 *    появляется отступ под неё.
 * 3. Во время штриха плашка растворяется.
 *
 * Правки не сохраняются: каждый тест выходит через «Отменить» — тест-аккаунт общий.
 */

const WIDE = { width: 1024, height: 768 };

test.describe.configure({ mode: 'serial' });

let page: Page;
let songId: string;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.setViewportSize(WIDE);
  await login(page);
  await page.goto(appPath('/dashboard/songs'));
  const firstCard = page.locator('[data-song-card]').first();
  await firstCard.waitFor({ state: 'visible', timeout: 15_000 });
  const id = await firstCard.getAttribute('data-song-card-item');
  expect(id, 'первая карточка песни должна нести data-song-card-item').toBeTruthy();
  songId = id as string;
});

test.afterAll(async () => {
  await page.close();
});

/** Две колонки на широком экране = постраничный `sheets`. Крупный кегль — несколько листов. */
async function openSheets(fontSize: number, showHeader = true): Promise<void> {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [
      'songs:view-settings',
      JSON.stringify({ columns: 2, fontSize, density: 'comfortable', showChords: true, showHeader }),
    ] as [string, string],
  );
  await page.goto(appPath(`/dashboard/song?id=${encodeURIComponent(songId)}`));
  await page.locator('[data-song-view-sheets-ready]').waitFor({ state: 'visible', timeout: 15_000 });
}

async function enterInk(): Promise<void> {
  await page.locator('[data-song-ink-open]').click();
  await expect(page.locator('[data-song-ink-toolbar]')).toBeVisible();
}

/** Выход без сохранения: при правках панель спрашивает подтверждение. */
async function cancelInk(): Promise<void> {
  await page.locator('[data-song-ink-cancel]').click();
  const confirm = page.getByRole('button', { name: 'Выйти', exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('[data-song-ink-toolbar]')).toHaveCount(0);
}

/** Горизонтальный штрих мышью от (x, y) влево на 60px. */
async function strokeLeft(x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 30, y, { steps: 5 });
  await page.mouse.move(x - 60, y, { steps: 5 });
  await page.mouse.up();
}

/** Сколько непрозрачных пикселей холста вокруг экранной точки. */
async function paintedAt(canvas: Locator, x: number, y: number): Promise<number> {
  return canvas.evaluate((el: HTMLCanvasElement, at) => {
    const rect = el.getBoundingClientRect();
    const dpr = el.width / rect.width;
    const ctx = el.getContext('2d');
    if (!ctx) return 0;
    const data = ctx.getImageData((at.x - rect.left) * dpr - 4, (at.y - rect.top) * dpr - 4, 8, 8).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
    return painted;
  }, { x, y });
}

test('штрих в пустом месте последнего листа рисуется', async () => {
  // Кегль растим, пока не получится хотя бы два листа.
  let sheetCount = 0;
  for (const fontSize of [24, 32, 40]) {
    await openSheets(fontSize);
    sheetCount = await page.locator('[data-song-view-sheet]').count();
    if (sheetCount >= 2) break;
  }
  test.skip(sheetCount < 2, 'первая песня не даёт второго листа даже крупным кеглем');

  // Раскладка после открытия ещё досчитывается (двухпроходный замер + дебаунс).
  await page.waitForTimeout(800);
  sheetCount = await page.locator('[data-song-view-sheet]').count();
  const last = page.locator('[data-song-view-sheet]').last();
  await last.scrollIntoViewIfNeeded();
  await enterInk();
  // Снятая шапка и отступ под панель не входят в высоту листа: вход в режим страницы
  // не переразбивает.
  // Раньше перелом приезжал с задержкой — посреди первого штриха.
  await page.waitForTimeout(800);
  await expect(page.locator('[data-song-view-sheet]')).toHaveCount(sheetCount);

  // Ищем на последнем листе точку, где нет ни одной строки: до фикса там касание
  // не доходило до слоя.
  const point = await last.evaluate((sheet) => {
    const box = sheet.getBoundingClientRect();
    const lines = Array.from(sheet.querySelectorAll('[data-song-line-section]')).map((el) =>
      el.getBoundingClientRect(),
    );
    const inside = (x: number, y: number) =>
      lines.some((r) => x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4);
    const visibleBottom = Math.min(box.bottom, window.innerHeight) - 40;
    for (let y = visibleBottom; y > box.top + 40; y -= 20) {
      for (let x = box.right - 60; x > box.left + box.width / 2; x -= 20) {
        const free = (px: number) =>
          !inside(px, y) && !document.elementFromPoint(px, y)?.closest('[data-song-ink-ui]');
        // Панель инструментов — UI режима, штрих там не начинается.
        if (free(x) && free(x - 30) && free(x - 60)) return { x, y };
      }
    }
    return null;
  });
  test.skip(point === null, 'на последнем листе нет пустого места');
  const { x, y } = point as { x: number; y: number };

  await strokeLeft(x, y);

  // Штрих закоммичен и отрисован на холсте последнего листа.
  await expect
    .poll(() => paintedAt(last.locator('[data-song-ink-canvas]'), x - 30, y), { timeout: 3_000 })
    .toBeGreaterThan(0);

  await cancelInk();
});

test('режим пометок прячет шапку и отдаёт её место листу, панель — внизу', async () => {
  await openSheets(20, false);
  const sheetCount = await page.locator('[data-song-view-sheet]').count();
  const firstLine = page.locator('[data-song-view-sheet] [data-song-line-section]').first();
  const topBefore = (await firstLine.boundingBox())?.y ?? 0;

  await enterInk();
  await expect(page.locator('[data-song-page-header-hidden]')).toHaveCount(1);
  // Освободившийся верх отдан листу: первая строка поднялась на место шапки.
  await expect.poll(async () => (await firstLine.boundingBox())?.y ?? 0).toBeLessThan(topBefore - 20);
  // …а листы не переразбились.
  await page.waitForTimeout(800);
  await expect(page.locator('[data-song-view-sheet]')).toHaveCount(sheetCount);

  // Панель — горизонтальная полоса у нижнего края.
  const bar = await page.locator('[data-song-ink-toolbar]').boundingBox();
  expect(bar).not.toBeNull();
  const { width: barWidth, height: barHeight, y: barTop } = bar as { width: number; height: number; y: number };
  expect(barWidth).toBeGreaterThan(barHeight * 3);
  expect(barTop + barHeight).toBeGreaterThan(WIDE.height - 40);

  await cancelInk();
  await expect(page.locator('[data-song-page-header-hidden]')).toHaveCount(0);
});

test('штрих в верхнем поле листа (вне строк потока) рисуется', async () => {
  await openSheets(20);
  await enterInk();

  const sheet = page.locator('[data-song-view-sheet]').first();
  const box = (await sheet.boundingBox()) as { x: number; y: number; width: number; height: number };
  // Верхнее поле листа (SHEET_PADDING_TOP) лежит над хостом слоя — до вылета холста
  // касание здесь не доходило до слоя.
  const x = box.x + box.width / 2;
  const y = box.y + 6;
  await strokeLeft(x, y);
  await expect
    .poll(() => paintedAt(sheet.locator('[data-song-ink-canvas]'), x - 30, y), { timeout: 3_000 })
    .toBeGreaterThan(0);

  await cancelInk();
});
