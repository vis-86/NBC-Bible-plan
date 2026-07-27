import { test, expect, type Page } from '@playwright/test';
import { appPath, login } from '../offline/helpers';

/**
 * Регрессия постраничной раскладки песни (§4.2/§4.4/§12, «Коммит E» плана
 * feature-song-viewer-editor). Гоняется на реальном прод-контуре (build + bff +
 * static:serve) — геометрию листов/страниц jsdom не воспроизводит, только браузер.
 *
 * Логика раскладки покрыта юнитами (`lib/sheets.test.ts`); здесь проверяется, что
 * реальный layout-движок браузера действительно раскладывает без пустых листов,
 * с одинаковым левым краем, без потери секций и без обрезки/лишнего скролла.
 */

const WIDE = { width: 1024, height: 768 };
const NARROW = { width: 390, height: 844 };

interface Settings {
  columns: 1 | 2;
  fontSize: number;
  density: 'comfortable' | 'compact';
  showChords: boolean;
  showHeader: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  columns: 1,
  fontSize: 17,
  density: 'comfortable',
  showChords: true,
  showHeader: true,
};

/**
 * Кладёт настройки просмотра в localStorage и открывает деталь песни заново.
 * localStorage выставляется, пока страница уже на origin приложения (шаред-page
 * после логина), затем goto песни — React читает ключ на маунте после навигации.
 */
async function openSong(page: Page, id: string, viewport: { width: number; height: number }, patch: Partial<Settings>): Promise<void> {
  await page.setViewportSize(viewport);
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    ['songs:view-settings', JSON.stringify({ ...DEFAULT_SETTINGS, ...patch })] as [string, string],
  );
  await page.goto(appPath(`/dashboard/song?id=${encodeURIComponent(id)}`));
  await page.locator('[data-song-view]').waitFor({ state: 'visible', timeout: 15_000 });
}

/** Дожидается, пока число листов перестанет меняться (двухпроходный замер + дебаунс). */
async function waitForStableSheets(page: Page): Promise<number> {
  await page.locator('[data-song-view-sheet]').first().waitFor({ state: 'visible', timeout: 10_000 });
  let previous = -1;
  await expect
    .poll(
      async () => {
        const count = await page.locator('[data-song-view-sheet]').count();
        const stable = count === previous;
        previous = count;
        return stable && count > 0 ? count : 0;
      },
      { timeout: 8_000, intervals: [200, 200, 200, 300] },
    )
    .toBeGreaterThan(0);
  return page.locator('[data-song-view-sheet]').count();
}

interface SheetGeometry {
  totalSections: number;
  sheets: Array<{
    sheetLeft: number;
    sheetWidth: number;
    sheetBottom: number;
    visible: Array<{ idx: number; left: number; clippedBottom: number }>;
  }>;
  docNoHScroll: boolean;
}

/** Меряет видимость секций внутри каждого листа в координатах браузера. */
async function measureSheets(page: Page): Promise<SheetGeometry> {
  return page.evaluate(() => {
    const sheets = Array.from(document.querySelectorAll<HTMLElement>('[data-song-view-sheet]'));
    const data = sheets.map((sheet) => {
      const sr = sheet.getBoundingClientRect();
      const sections = Array.from(sheet.querySelectorAll<HTMLElement>('.cproSongSection'));
      const visible: Array<{ idx: number; left: number; clippedBottom: number }> = [];
      sections.forEach((section, idx) => {
        const r = section.getBoundingClientRect();
        const overlapW = Math.min(sr.right, r.right) - Math.max(sr.left, r.left);
        const overlapH = Math.min(sr.bottom, r.bottom) - Math.max(sr.top, r.top);
        if (overlapW > 4 && overlapH > 4) {
          visible.push({ idx, left: r.left - sr.left, clippedBottom: r.bottom - sr.bottom });
        }
      });
      return { sheetLeft: sr.left, sheetWidth: sr.width, sheetBottom: sr.bottom, visible };
    });
    const firstSheet = sheets[0];
    const totalSections = firstSheet ? firstSheet.querySelectorAll('.cproSongSection').length : 0;
    return {
      totalSections,
      sheets: data,
      docNoHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });
}

// Серийный прогон с одним логином и общим page: логин на проде жёстко rate-limited
// (10 попыток / 15 мин на IP), поэтому логиниться на каждый тест нельзя — тест-аккаунт
// один. Общий page это же и оптимизация: song data греется один раз.
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

test.describe('Раскладка песни — листы (sheets)', () => {
  // Одноколоночных листов больше нет by design (resolveSongViewMode: sheets только при
  // columns === 2 && isWideLayout) — параметризация по columns больше не нужна.
  const columns = 2;
  for (const fontSize of [12, 18, 30]) {
    test(`нет пустых листов и потерь секций: ${columns} кол. × ${fontSize}px`, async () => {
      await openSong(page, songId, WIDE, { columns, fontSize });
      const count = await waitForStableSheets(page);
      const geo = await measureSheets(page);

      expect(geo.totalSections, 'песня должна иметь хотя бы одну секцию').toBeGreaterThan(0);
      expect(geo.sheets).toHaveLength(count);

      // 1. Ни одного пустого листа: на каждом листе видна хотя бы одна секция.
      geo.sheets.forEach((sheet, i) => {
        expect(sheet.visible.length, `лист ${i + 1}/${count} не должен быть пустым`).toBeGreaterThan(0);
      });

      // 2. Левый край содержимого одинаков на всех листах. Сравниваем ТОЛЬКО левую
      // колонку: при 2 колонках и крупном шрифте лист может нести контент только в
      // правой колонке (это не дрейф). Дрейф раскладки (translate на width, а не на
      // pitch) сдвинул бы именно левый край — его и ловим.
      const leftColOrigins = geo.sheets
        .map((sheet) => {
          const band = sheet.sheetWidth / columns; // ширина одной колонки листа
          const leftCol = sheet.visible.map((v) => v.left).filter((l) => l >= -2 && l < band);
          return leftCol.length ? Math.min(...leftCol) : null;
        })
        .filter((x): x is number => x !== null);
      expect(leftColOrigins.length, 'хотя бы один лист должен иметь контент в левой колонке').toBeGreaterThan(0);
      const spread = Math.max(...leftColOrigins) - Math.min(...leftColOrigins);
      expect(spread, `левый край левой колонки должен совпадать на всех листах, разброс=${spread}`).toBeLessThanOrEqual(3);

      // 3. Объединение секций по листам покрывает все секции песни (ничего не потеряно).
      const seen = new Set<number>();
      geo.sheets.forEach((sheet) => sheet.visible.forEach((v) => seen.add(v.idx)));
      expect(seen.size, 'все секции песни должны быть видны хотя бы на одном листе').toBe(geo.totalSections);

      // 4. Низ последнего листа не обрезан: последняя секция помещается в лист.
      const last = geo.sheets[geo.sheets.length - 1];
      const maxClipped = Math.max(...last.visible.map((v) => v.clippedBottom));
      expect(maxClipped, 'содержимое последнего листа не должно уходить под нижний край').toBeLessThanOrEqual(2);

      // 5. Горизонтального скролла нет.
      expect(geo.docNoHScroll, 'страница не должна иметь горизонтального скролла').toBe(true);
    });
  }
});

test.describe('Раскладка песни — смена тональности (M4)', () => {
  // Транспозиция меняет ширину аккордов (`Bb7` шире `A7`), а значит и разбивку по листам.
  // Если сдвиг не входит в триггеры `useSheets`, листы остаются от прежней тональности:
  // на экране это пустой или обрезанный лист. jsdom этого не видит — только браузер.
  test('после смены тональности листы пересобираются, пустых нет', async () => {
    await openSong(page, songId, WIDE, { columns: 2, fontSize: 18 });
    const countBefore = await waitForStableSheets(page);
    const keyBefore = await page.locator('[data-song-key-picker-value]').textContent();
    expect(keyBefore, 'селектор тональности должен показывать действующую тональность').toBeTruthy();

    await page.locator('[data-song-key-picker-toggle]').click();
    // Тональность меняется слайдером полутонов относительно исходной (`keyByOffset`):
    // клавиатурой, а не `fill` — нужен нативный input-event, который слышит React.
    const semitones = page.locator('[data-song-key-picker-semitone-slider]');
    await semitones.waitFor({ state: 'visible', timeout: 5_000 });
    await semitones.focus();
    // Целый тон: сдвиг заведомо ненулевой и меняет ширину аккордов.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    await expect(page.locator('[data-song-key-picker-value]')).not.toHaveText(keyBefore?.trim() as string);

    // Шторка перекрывает лист — меряем геометрию только после её закрытия.
    await page.locator('[data-bottom-sheet-close-button]').click();
    await expect(page.locator('[data-song-key-picker-panel]')).toHaveCount(0);

    const countAfter = await waitForStableSheets(page);
    const geo = await measureSheets(page);
    expect(geo.sheets).toHaveLength(countAfter);

    geo.sheets.forEach((sheet, i) => {
      expect(sheet.visible.length, `после транспозиции лист ${i + 1}/${countAfter} не должен быть пустым`).toBeGreaterThan(0);
    });

    // Все секции по-прежнему видны, ничего не потеряно и не обрезано снизу.
    const seen = new Set<number>();
    geo.sheets.forEach((sheet) => sheet.visible.forEach((v) => seen.add(v.idx)));
    expect(seen.size, 'после транспозиции все секции должны остаться видимыми').toBe(geo.totalSections);
    const last = geo.sheets[geo.sheets.length - 1];
    expect(Math.max(...last.visible.map((v) => v.clippedBottom))).toBeLessThanOrEqual(2);
    expect(geo.docNoHScroll, 'после транспозиции не должно появляться горизонтального скролла').toBe(true);
    expect(countBefore, 'листы должны быть посчитаны и до, и после').toBeGreaterThan(0);

    // Личная тональность остаётся у песни — убираем её, чтобы не влиять на другие тесты.
    await page.locator('[data-song-key-picker-toggle]').click();
    await page.locator('[data-song-key-picker-reset]').click();
    await expect(page.locator('[data-song-key-picker-reset]')).toHaveCount(0);
  });
});

test.describe('Раскладка песни — без горизонтального скролла', () => {
  test('узкий экран (390px): сохранённые 2 колонки дают scroll (resolveSongViewMode), скролла по X нет', async () => {
    // Даже сохранённые 2 колонки обязаны свестись к scroll на телефоне
    // (SONG_WIDE_LAYOUT_QUERY) — resolveSongViewMode требует ещё и isWideLayout.
    await openSong(page, songId, NARROW, { columns: 2, fontSize: 18 });

    await expect(page.locator('[data-song-view]')).toHaveAttribute('data-mode', 'scroll');
    await expect(page.locator('[data-song-view-sheets]')).toHaveCount(0);

    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noHScroll, 'на 390px не должно быть горизонтального скролла').toBe(true);
  });

  test('планшет (1024px): 1 колонка даёт scroll без горизонтального скролла', async () => {
    await openSong(page, songId, WIDE, { columns: 1, fontSize: 18 });

    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noHScroll, 'на 1024px не должно быть горизонтального скролла').toBe(true);
  });
});
