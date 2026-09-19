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

    // Даём анимации хрома (transform 300ms) доиграть. Шапка — оверлей, высоту потока
    // она не меняет, но её съезд на СТАРТЕ соседствует с клампом scrollTop от прочих
    // перестроений на пару пикселей. Это лейаут, не движок.
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

  test('фокус-режим: play сворачивает хром, оставляя управление автоскроллом', async () => {
    await openSong(page, songId, NARROW, {});
    await page.locator('[data-song-autoscroll]').waitFor({ state: 'visible', timeout: 10_000 });

    const header = page.locator('[data-song-page-header-collapse]');
    await expect(header).not.toHaveAttribute('data-song-page-header-hidden', '');
    await expect(page.locator('[data-song-ink-open]')).toBeVisible();

    await page.locator('[data-song-autoscroll-toggle]').click();
    await expect(page.locator('[data-song-autoscroll-toggle]')).toHaveAttribute('aria-label', 'Пауза автоскролла');

    // Хром уехал: шапка свёрнута, карандаш пометок из DOM ушёл.
    await expect(header).toHaveAttribute('data-song-page-header-hidden', '');
    await expect(page.locator('[data-song-ink-open]')).toHaveCount(0);
    // Управление автоскроллом остаётся — иначе режим нечем выключить.
    await expect(page.locator('[data-song-autoscroll-toggle]')).toBeVisible();
    await expect(page.locator('[data-song-autoscroll-speed]')).toBeVisible();
    // …и вместе с ним тональность с настройками: их правят именно во время пения.
    await expect(page.locator('[data-song-quick-tools]')).toBeVisible();
    await expect(page.locator('[data-song-page-view-settings-button]')).toBeVisible();

    // Пауза возвращает карандаш.
    await page.locator('[data-song-autoscroll-toggle]').click();
    await expect(page.locator('[data-song-autoscroll-toggle]')).toHaveAttribute('aria-label', 'Запустить автоскролл');
    await expect(page.locator('[data-song-ink-open]')).toBeVisible();
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

  test('открытая шторка удерживает лист на месте и не выключает режим, закрытие — возобновляет', async () => {
    await openSong(page, songId, NARROW, {}, 29);
    await page.locator('[data-song-autoscroll]').waitFor({ state: 'visible', timeout: 10_000 });

    await page.locator('[data-song-autoscroll-toggle]').click();
    await expect.poll(async () => scrollTop(page), { timeout: 5_000, intervals: [200, 200, 300] }).toBeGreaterThan(0);

    // Настройки доступны прямо из фокус-режима — через таблетку на месте уехавшей шапки.
    await page.locator('[data-song-quick-tools] [data-song-page-view-settings-button]').click();
    await expect(page.locator('[data-song-view-settings]')).toBeVisible();

    // Лист стоит: править кегль на едущем тексте невозможно.
    const held = await scrollTop(page);
    await page.waitForTimeout(600);
    expect(Math.abs((await scrollTop(page)) - held), 'под открытой шторкой лист стоит').toBeLessThanOrEqual(1);

    // Режим при этом остался включённым — закрытие возвращает движение само.
    await page.locator('[data-bottom-sheet-close-button]').click();
    await expect(page.locator('[data-song-autoscroll-toggle]')).toHaveAttribute('aria-label', 'Пауза автоскролла');
    await expect
      .poll(async () => scrollTop(page), { timeout: 5_000, intervals: [300, 300, 500] })
      .toBeGreaterThan(held + 1);

    await page.locator('[data-song-autoscroll-toggle]').click();
    await expect(page.locator('[data-song-autoscroll-toggle]')).toHaveAttribute('aria-label', 'Запустить автоскролл');
  });

  test('пользовательский wheel приостанавливает автоскролл, но не выключает его', async () => {
    await openSong(page, songId, NARROW, {});
    await page.locator('[data-song-autoscroll]').waitFor({ state: 'visible', timeout: 10_000 });

    await page.locator('[data-song-autoscroll-toggle]').click();
    await expect.poll(async () => scrollTop(page), { timeout: 5_000, intervals: [200, 200, 300] }).toBeGreaterThan(0);

    // Приостановка: wheel по скролл-контейнеру.
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-song-view]')?.closest<HTMLElement>('.overflow-y-auto');
      scroller?.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, bubbles: true }));
    });

    // Режим остался включённым — кнопка по-прежнему «Пауза».
    await expect(page.locator('[data-song-autoscroll-toggle]')).toHaveAttribute('aria-label', 'Пауза автоскролла');
    const suspended = await scrollTop(page);
    await page.waitForTimeout(300);
    expect(Math.abs((await scrollTop(page)) - suspended), 'сразу после жеста лист стоит').toBeLessThanOrEqual(1);

    // …и через паузу движок поехал сам, без повторного нажатия кнопки.
    await expect
      .poll(async () => scrollTop(page), { timeout: 5_000, intervals: [300, 300, 500] })
      .toBeGreaterThan(suspended + 1);
  });

  test('при спрятанной шапке тональность и настройки остаются на месте кнопок шапки', async () => {
    await openSong(page, songId, NARROW, {});
    const header = page.locator('[data-song-page-header-collapse]');
    await expect(header).not.toHaveAttribute('data-song-page-header-hidden', '');
    await expect(page.locator('[data-song-quick-tools]')).toHaveCount(0);

    const settingsBox = () =>
      page
        .locator('[data-song-page-view-settings-button]')
        .evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { top: rect.top, right: rect.right, height: rect.height };
        });
    const headerBox = await settingsBox();

    // Скролл вниз прячет шапку.
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-song-view]')?.closest<HTMLElement>('.overflow-y-auto');
      if (scroller) scroller.scrollTop = 400;
    });
    await expect(header).toHaveAttribute('data-song-page-header-hidden', '');

    const quickTools = page.locator('[data-song-quick-tools]');
    await expect(quickTools).toBeVisible();
    await expect(quickTools.locator('[data-song-page-view-settings-button]')).toBeVisible();
    // Кнопки обязаны остаться ровно там же, где стояли в шапке: уход шапки не должен
    // читаться как перескок управления по экрану. Замер — после проявления
    // (`margin-top` едет к нулю), иначе меряется промежуточный кадр анимации.
    await page.waitForTimeout(400);
    const floatingBox = await settingsBox();
    expect(Math.abs(floatingBox.right - headerBox.right), 'правый край совпадает с шапкой').toBeLessThanOrEqual(1);
    expect(Math.abs(floatingBox.top - headerBox.top), 'вертикаль совпадает с шапкой').toBeLessThanOrEqual(1);
    // Вырез iPhone: `pt-safe` кладёт отступ ВНУТРЬ высоты (border-box), и с жёсткой
    // `h-[52px]` кнопкам оставалось несколько пикселей — они уезжали под бровь.
    // Эмулируем вырез тем же классом, которым его получает прод.
    await page.addStyleTag({ content: '.pt-safe { padding-top: 47px !important; }' });
    const withNotch = await settingsBox();
    expect(withNotch.top, 'кнопка ниже брови выреза, а не под ней').toBeGreaterThanOrEqual(47);
    expect(withNotch.height, 'кнопка не сплющена остатком высоты').toBe(headerBox.height);

    // Контрол ровно один: шапка отдаёт кнопки таблетке, а не дублирует их.
    await expect(page.locator('[data-song-page-view-settings-button]')).toHaveCount(1);
    await expect(page.locator('[data-song-key-picker-toggle]')).toHaveCount(1);

    // Шторка транспонирования из таблетки открывается на всю высоту (не схлопывается
    // в размер таблетки — гейт на `transform` у предка).
    await page.locator('[data-song-key-picker-toggle]').click();
    await expect(page.locator('[data-song-key-picker-panel]')).toBeVisible();
    const panelBox = await page
      .locator('[data-song-key-picker-panel]')
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, width: rect.width, viewport: window.innerWidth };
      });
    // Шторка обязана лечь на всю ширину экрана. Ловит и transform, и backdrop-filter
    // на предке: любой из них делает таблетку контейнером для `position: fixed`,
    // и шторка схлопывается в её габариты (реальный дефект первой версии).
    // 32px — запас на внутреннее поле шторки (px-6); главное, что панель у левого края
    // экрана, а не в правом верхнем углу внутри таблетки.
    expect(panelBox.left, 'шторка прижата к левому краю экрана').toBeLessThanOrEqual(32);
    expect(panelBox.width, 'шторка во всю ширину, а не в габаритах таблетки').toBeGreaterThan(
      panelBox.viewport * 0.8,
    );
  });
});

test.describe('Шапка песни — оверлей без скачка', () => {
  test('скрытие шапки при скролле не сдвигает текст и не меняет высоту вьюпорта', async () => {
    await openSong(page, songId, NARROW, {});
    const header = page.locator('[data-song-page-header-collapse]');
    await expect(header).not.toHaveAttribute('data-song-page-header-hidden', '');

    const metrics = () =>
      page.evaluate(() => {
        const scroller = document.querySelector('[data-song-view]')?.closest<HTMLElement>('.overflow-y-auto');
        const line = document.querySelector('[data-song-view-flow] .cproSongLine');
        return {
          clientHeight: scroller?.clientHeight ?? -1,
          scrollTop: Math.round(scroller?.scrollTop ?? -1),
          // Экранная позиция первой строки: если шапка схлопывалась бы в потоке,
          // текст уехал бы вверх ровно на её высоту.
          lineTop: line ? Math.round(line.getBoundingClientRect().top) : -1,
        };
      });

    // Уводим лист достаточно далеко, чтобы шапка имела право спрятаться (minScrollTop).
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 300);
    await expect(header).toHaveAttribute('data-song-page-header-hidden', '');
    await page.waitForTimeout(400); // transform доиграл
    const hiddenState = await metrics();

    // Возвращаем шапку тапом и сравниваем: ни высота вьюпорта, ни экранная позиция
    // строки при том же scrollTop меняться не должны — шапка лежит поверх листа.
    await page.locator('[data-song-page-viewport]').click({ position: { x: 30, y: 300 } });
    await expect(header).not.toHaveAttribute('data-song-page-header-hidden', '');
    await page.waitForTimeout(400);
    const shownState = await metrics();

    expect(shownState.scrollTop, 'тап не прокручивает лист').toBe(hiddenState.scrollTop);
    expect(shownState.clientHeight, 'высота вьюпорта не зависит от шапки').toBe(hiddenState.clientHeight);
    expect(
      Math.abs(shownState.lineTop - hiddenState.lineTop),
      'текст не сдвигается при появлении/уходе шапки',
    ).toBeLessThanOrEqual(1);
  });

  test('тап по листу возвращает скрытую шапку', async () => {
    await openSong(page, songId, NARROW, {});
    const header = page.locator('[data-song-page-header-collapse]');

    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 300);
    await expect(header).toHaveAttribute('data-song-page-header-hidden', '');

    await page.locator('[data-song-page-viewport]').click({ position: { x: 30, y: 300 } });
    await expect(header).not.toHaveAttribute('data-song-page-header-hidden', '');
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
