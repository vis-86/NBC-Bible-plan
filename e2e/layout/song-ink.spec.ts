import { test, expect, type Page } from '@playwright/test';
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
  await expect(page.locator('[data-song-ink-modebar]')).toBeVisible();
}

/** Выход без сохранения: при правках плашка спрашивает подтверждение. */
async function cancelInk(): Promise<void> {
  await page.locator('[data-song-ink-cancel]').click();
  const confirm = page.getByRole('button', { name: 'Выйти', exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('[data-song-ink-modebar]')).toHaveCount(0);
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
  // Отступ под плашку не входит в высоту листа: вход в режим страницы не переразбивает.
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
        // Рельс инструментов и плашка — тоже UI режима, штрих там не начинается.
        if (free(x) && free(x - 30) && free(x - 60)) return { x, y };
      }
    }
    return null;
  });
  test.skip(point === null, 'на последнем листе нет пустого места');
  const { x, y } = point as { x: number; y: number };

  await page.mouse.move(x, y);
  await page.mouse.down();
  // Во время штриха плашка растворяется и пропускает касания.
  await page.mouse.move(x - 30, y, { steps: 5 });
  await expect(page.locator('[data-song-ink-modebar]')).toHaveAttribute('data-song-ink-modebar-drawing', '');
  await page.mouse.move(x - 60, y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-song-ink-modebar]')).not.toHaveAttribute('data-song-ink-modebar-drawing', '');

  // Штрих закоммичен и отрисован на холсте последнего листа.
  await expect
    .poll(
      () =>
        last.locator('[data-song-ink-canvas]').evaluate((canvas: HTMLCanvasElement, at) => {
          const rect = canvas.getBoundingClientRect();
          const dpr = canvas.width / rect.width;
          const ctx = canvas.getContext('2d');
          if (!ctx) return 0;
          const data = ctx.getImageData((at.x - 30 - rect.left) * dpr - 4, (at.y - rect.top) * dpr - 4, 8, 8).data;
          let painted = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
          return painted;
        }, { x, y }),
      { timeout: 3_000 },
    )
    .toBeGreaterThan(0);

  await cancelInk();
});

test('в начале песни режим пометок опускает первые строки под плашку', async () => {
  // Без заголовка песни первая строка стоит у самого верха листа — худший случай.
  await openSheets(20, false);
  await enterInk();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const bar = document.querySelector('[data-song-ink-modebar] > div')?.getBoundingClientRect();
        const firstLine = document
          .querySelector('[data-song-view-sheet] [data-song-line-section]')
          ?.getBoundingClientRect();
        return bar && firstLine ? Math.round(firstLine.top - bar.bottom) : -999;
      }),
    )
    .toBeGreaterThanOrEqual(0);

  await cancelInk();
});
