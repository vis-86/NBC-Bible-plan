import { test, expect, type Page } from '@playwright/test';
import { appPath, login } from '../offline/helpers';

/**
 * Регрессия автоскролла (§8/§12, план feature-song-autoscroll). Гоняется на реальном
 * прод-контуре (build + bff + static:serve): rAF-движок и нативный `scrollTop` jsdom не
 * воспроизводит, поведение (растёт → стоп у низа → прерывание) видно только в браузере.
 * Чистая математика скорости и персист покрыты юнитами (`lib/autoScroll*.test.ts`).
 *
 * Один логин на спек: прод жёстко rate-limited (10 попыток / 15 мин на IP), тест-аккаунт один.
 */

const NARROW = { width: 390, height: 640 }; // низкий вьюпорт → песня заведомо скроллится
const WIDE = { width: 1024, height: 768 };

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
 * Кладёт настройки просмотра и (опционально) глобальную «последнюю» ступень автоскролла
 * в localStorage (тот же приём, что в song-layout.spec) и открывает песню. Ступень — per-song
 * персист (`songs:autoscroll-speed`/`songs:autoscroll-last`), не часть `songs:view-settings`.
 */
async function openSong(
  page: Page,
  id: string,
  viewport: { width: number; height: number },
  patch: Partial<Settings>,
  lastStep?: number,
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    ['songs:view-settings', JSON.stringify({ ...DEFAULT_SETTINGS, ...patch })] as [string, string],
  );
  if (lastStep !== undefined) {
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      ['songs:autoscroll-last', String(lastStep)] as [string, string],
    );
  }
  await page.goto(appPath(`/dashboard/song?id=${encodeURIComponent(id)}`));
  await page.locator('[data-song-view]').waitFor({ state: 'visible', timeout: 15_000 });
}

/** Скролл-контейнер песни в координатах DOM (тот же селектор, что в song-layout.spec). */
async function scrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-song-view]')?.closest<HTMLElement>('.overflow-y-auto');
    return scroller ? Math.round(scroller.scrollTop) : -1;
  });
}

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

test.describe('Автоскролл — режим scroll', () => {
  test('play двигает scrollTop, доезжает до низа и останавливается без зацикливания', async () => {
    // Максимальная ступень (глобальная «последняя», песня своей записи ещё не имеет) —
    // чтобы рост scrollTop ловился быстро.
    await openSong(page, songId, NARROW, {}, 29);

    const fab = page.locator('[data-song-autoscroll]');
    await fab.waitFor({ state: 'visible', timeout: 10_000 });

    expect(await scrollTop(page), 'старт от верха').toBe(0);
    await page.locator('[data-song-autoscroll-toggle]').click();
    await expect(page.locator('[data-song-autoscroll-toggle]')).toHaveAttribute('aria-label', 'Пауза автоскролла');

    // scrollTop растёт.
    await expect.poll(async () => scrollTop(page), { timeout: 5_000, intervals: [200, 200, 300] }).toBeGreaterThan(0);

    // Натуральная скорость (строки/мин) слишком медленная, чтобы доехать до низа за таймаут
    // теста — подсаживаем позицию к низу и проверяем, что движок сам доводит до конца и стоп.
    // scrollTop меняем напрямую (не через контрол) — это не тач/колесо, паузы не будет.
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-song-view]')?.closest<HTMLElement>('.overflow-y-auto');
      if (scroller) scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight - 40;
    });

    // Доезжает до низа и сам останавливается (кнопка снова «Запустить»).
    await expect(page.locator('[data-song-autoscroll-toggle]')).toHaveAttribute('aria-label', 'Запустить автоскролл', { timeout: 15_000 });

    const atBottom = await page.evaluate(() => {
      const scroller = document.querySelector('[data-song-view]')?.closest<HTMLElement>('.overflow-y-auto');
      if (!scroller) return false;
      return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    });
    expect(atBottom, 'остановка ровно у низа').toBe(true);

    // Даём анимации автоскрытия шапки (grid-rows 300ms) доиграть: она меняет высоту вьюпорта
    // и клампит scrollTop на пару пикселей — это лейаут, не движок.
    await page.waitForTimeout(500);
    const settled = await scrollTop(page);
    expect(settled, 'не откатился к верху (нет зацикливания)').toBeGreaterThan(0);

    // Не зациклился и не ползёт дальше: scrollTop стабилен.
    await page.waitForTimeout(700);
    const after = await scrollTop(page);
    expect(Math.abs(after - settled), 'после остановки scrollTop стабилен').toBeLessThanOrEqual(2);
  });

  test('кнопки скорости видны только при проигрывании, меняют ступень (персист per-song) и не ставят на паузу', async () => {
    await openSong(page, songId, NARROW, {}, 2); // ступень 3
    await page.locator('[data-song-autoscroll]').waitFor({ state: 'visible', timeout: 10_000 });

    // До старта кнопок скорости нет.
    await expect(page.locator('[data-song-autoscroll-speed]')).toHaveCount(0);

    await page.locator('[data-song-autoscroll-toggle]').click();
    const speed = page.locator('[data-song-autoscroll-speed]');
    await expect(speed).toBeVisible();
    await expect(page.locator('[data-song-autoscroll-speed-value]')).toHaveText('3');

    // Быстрее → ступень растёт, автоскролл продолжает играть (кнопка вне контейнера — не пауза).
    await page.locator('[data-song-autoscroll-faster]').click();
    await expect(page.locator('[data-song-autoscroll-speed-value]')).toHaveText('4');
    await expect(page.locator('[data-song-autoscroll-toggle]')).toHaveAttribute('aria-label', 'Пауза автоскролла');

    // Медленнее → ступень падает.
    await page.locator('[data-song-autoscroll-slower]').click();
    await expect(page.locator('[data-song-autoscroll-speed-value]')).toHaveText('3');

    // Персист скорости — per-song карта (songs:autoscroll-speed), не в составе view-settings.
    const storedStep = await page.evaluate((id) => {
      const raw = window.localStorage.getItem('songs:autoscroll-speed');
      return raw ? (JSON.parse(raw)[id] as number) : null;
    }, songId);
    expect(storedStep, 'ступень (index) сохранена per-song').toBe(2);
  });

  test('при открытых настройках контрол автоскролла скрыт (не перекрывает лист)', async () => {
    await openSong(page, songId, NARROW, {});
    await page.locator('[data-song-autoscroll]').waitFor({ state: 'visible', timeout: 10_000 });

    await page.locator('[data-song-page-view-settings-button]').click();
    // Лист настроек открылся, контрол автоскролла ушёл из DOM.
    await expect(page.locator('[data-song-autoscroll]')).toHaveCount(0);
  });

  test('при открытой шторке транспонирования контрол автоскролла скрыт (не перекрывает шторку)', async () => {
    await openSong(page, songId, NARROW, {});
    await page.locator('[data-song-autoscroll]').waitFor({ state: 'visible', timeout: 10_000 });

    await page.locator('[data-song-key-picker-toggle]').click();
    await expect(page.getByText('Транспонирование')).toBeVisible();
    // Шторка транспонирования открылась, контрол автоскролла ушёл из DOM.
    await expect(page.locator('[data-song-autoscroll]')).toHaveCount(0);

    await page.locator('[data-bottom-sheet-close-button]').click();
    // Шторка закрылась, контрол автоскролла вернулся.
    await expect(page.locator('[data-song-autoscroll]')).toBeVisible();
  });

  test('пользовательский wheel по контейнеру ставит автоскролл на паузу', async () => {
    await openSong(page, songId, NARROW, {});
    await page.locator('[data-song-autoscroll]').waitFor({ state: 'visible', timeout: 10_000 });

    await page.locator('[data-song-autoscroll-toggle]').click();
    await expect.poll(async () => scrollTop(page), { timeout: 5_000, intervals: [200, 200, 300] }).toBeGreaterThan(0);

    // Прерывание: wheel по скролл-контейнеру.
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-song-view]')?.closest<HTMLElement>('.overflow-y-auto');
      scroller?.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, bubbles: true }));
    });

    await expect(page.locator('[data-song-autoscroll-toggle]')).toHaveAttribute('aria-label', 'Запустить автоскролл');
    const paused = await scrollTop(page);
    await page.waitForTimeout(700);
    const after = await scrollTop(page);
    expect(Math.abs(after - paused), 'после паузы scrollTop не растёт').toBeLessThanOrEqual(1);
  });
});

test.describe('Автоскролл — отсутствует в режиме листов', () => {
  test('columns: 2 на широком экране ⇒ FAB автоскролла скрыт', async () => {
    // Режим sheets существует только на широком экране (SONG_WIDE_LAYOUT_QUERY).
    await openSong(page, songId, WIDE, { columns: 2, fontSize: 18 });
    await expect(page.locator('[data-song-view]')).toHaveAttribute('data-mode', 'sheets');
    await expect(page.locator('[data-song-autoscroll]')).toHaveCount(0);
  });
});
