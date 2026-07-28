import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { appPath, login, waitForServiceWorkerReady } from './helpers';

/**
 * T15: прод-контур офлайна для сетлистов (`.ai-factory/plans/feature-setlists.md`).
 * Проверяет заявление «SW отдаёт /dashboard/song для любых search-параметров» и
 * что новые app-shell маршруты (setlists/setlist) реально прекешируются и рендерят
 * контент офлайн — то же самое, что уже покрыто для dashboard/read/songs, плюс
 * специфичный для сетов режим playback (навигация между песнями по кнопке).
 *
 * Данные: тестовый сет создаётся через BFF от имени `claude-offline-test`
 * (роль `musician`) непосредственно перед тестами и удаляется после — самоочищающийся
 * фикстур, не оставляющий мусора в проде (см. CLAUDE.md: прод-Directus — ручная
 * работа Игоря, тесты не должны копить туда данные).
 *
 * Логин выполняется РОВНО ОДИН РАЗ на весь файл (`beforeAll`), а `storageState`
 * переиспользуется в каждом новом контексте — BFF рейт-лимитит `/api/auth/login`
 * (10/15мин на IP, `server/src/routes/auth.ts`), и полный прогон `e2e:offline`
 * уже расходует бюджет логинов из остальных спеков в этом же окне.
 */

let setlistId: string;
let songIds: number[];
let storageState: Awaited<ReturnType<BrowserContext['storageState']>>;

async function createTestSetlist(request: APIRequestContext): Promise<{ id: string; songIds: number[] }> {
  const songsRes = await request.get(appPath('/api/songs'));
  expect(songsRes.ok(), 'GET /api/songs должен быть доступен под сессией e2e-аккаунта').toBe(true);
  const { songs } = (await songsRes.json()) as { songs: Array<{ id: string }> };
  expect(songs.length, 'в каталоге должно быть хотя бы 2 песни для теста').toBeGreaterThanOrEqual(2);
  const ids = [Number(songs[0].id), Number(songs[1].id)];

  const createRes = await request.post(appPath('/api/setlists'), {
    data: { title: 'E2E offline test setlist', songIds: ids },
  });
  expect(createRes.ok(), 'POST /api/setlists (создание тестового сета) должен пройти').toBe(true);
  const { id } = (await createRes.json()) as { id: string };
  return { id, songIds: ids };
}

test.describe('Сетлисты — офлайн (T15)', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page);
    storageState = await context.storageState();
    const created = await createTestSetlist(context.request);
    setlistId = created.id;
    songIds = created.songIds;
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!setlistId) return;
    const context = await browser.newContext({ storageState });
    await context.request.delete(appPath(`/api/setlists/${setlistId}`));
    await context.close();
  });

  test('холодный старт офлайн на /dashboard/setlists и /dashboard/setlist?id=… — контент отдаётся, консоль чистая', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await waitForServiceWorkerReady(page);
    // Прогреваем оба экрана онлайн один раз — как и в остальных T9/T15 сценариях,
    // прод-контур проверяет, что precache + IDB apiCache реально отдают контент
    // офлайн, а не то, что маршрут никогда не открывался (это отдельный тест ниже).
    await page.goto(appPath('/dashboard/setlists'));
    await expect(page.locator('[data-setlists-page]')).toBeVisible();
    await page.goto(appPath(`/dashboard/setlist?id=${setlistId}`));
    await expect(page.locator('[data-setlist-view]')).toBeVisible();
    await page.close();

    const rscErrors: string[] = [];
    await context.setOffline(true);
    const offlinePage = await context.newPage();
    offlinePage.on('console', (msg) => {
      if (msg.text().includes('Failed to fetch RSC payload')) rscErrors.push(msg.text());
    });

    await offlinePage.goto(appPath('/dashboard/setlists'));
    await expect(offlinePage.locator('[data-setlists-page]')).toBeVisible();
    await expect(offlinePage.getByText('Нет соединения')).not.toBeVisible();

    await offlinePage.goto(appPath(`/dashboard/setlist?id=${setlistId}`));
    await expect(offlinePage.locator('[data-setlist-view]')).toBeVisible();
    await expect(offlinePage.getByText('Нет соединения')).not.toBeVisible();

    expect(rscErrors, 'RSC-пейлоад запрашивался по сети вместо precache').toEqual([]);

    await context.setOffline(false);
    await context.close();
  });

  test('режим сета офлайн: /dashboard/song?id=…&setlistId=… открывается, «›» переводит на следующую песню, консоль чистая', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    // Прогрев: онлайн-визит детали сета кладёт её в apiCache (readSetlistThrough),
    // а визит первой песни сета — в IDB store `songs` (readSongThrough); soседняя
    // песня прогревается сама внутри useSetlistPlayback (warm prev/next).
    await page.goto(appPath(`/dashboard/setlist?id=${setlistId}`));
    await expect(page.locator('[data-setlist-view]')).toBeVisible();
    await page.goto(appPath(`/dashboard/song?id=${songIds[0]}&setlistId=${setlistId}`));
    await expect(page.locator('[data-song-page]')).toBeVisible();
    await expect(page.locator('[data-setlist-pager-dock-next]')).toBeVisible();
    await page.close();

    const rscErrors: string[] = [];
    await context.setOffline(true);
    const offlinePage = await context.newPage();
    offlinePage.on('console', (msg) => {
      if (msg.text().includes('Failed to fetch RSC payload')) rscErrors.push(msg.text());
    });

    // Заявление «SW отдаёт /dashboard/song для любых search-параметров» — прямой
    // офлайн-заход по URL с setlistId, без клиентской навигации из списка.
    await offlinePage.goto(appPath(`/dashboard/song?id=${songIds[0]}&setlistId=${setlistId}`));
    await expect(offlinePage.locator('[data-song-page]')).toBeVisible();
    await expect(offlinePage.getByText('Нет соединения')).not.toBeVisible();

    const counterBefore = await offlinePage.locator('[data-setlist-pager-dock-counter]').textContent();
    expect(counterBefore?.trim()).toBe('1 / 2');

    await offlinePage.locator('[data-setlist-pager-dock-next]').click();
    await expect(offlinePage).toHaveURL(new RegExp(`id=${songIds[1]}`));
    await expect(offlinePage.locator('[data-setlist-pager-dock-counter]')).toHaveText('2 / 2');

    expect(rscErrors, 'RSC-пейлоад запрашивался по сети вместо precache').toEqual([]);

    await context.setOffline(false);
    await context.close();
  });

  test('pull-to-refresh офлайн: список остаётся, спиннер не залипает, консоль чистая', async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await waitForServiceWorkerReady(page);
    await page.goto(appPath('/dashboard/setlists'));
    await expect(page.locator('[data-setlists-page]')).toBeVisible();

    const rscErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Failed to fetch RSC payload')) rscErrors.push(msg.text());
    });

    // page.route не перехватывает запросы, прошедшие через SW — офлайн только контекстом.
    await context.setOffline(true);

    const container = page.locator('[data-pull-to-refresh]');
    await expect(container).toBeVisible();
    const box = (await container.boundingBox())!;
    const startX = box.x + box.width / 2;
    const startY = box.y + 20;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Серия шагов обязательна: ось жеста решается порогом 8px, одним движением не читается.
    for (const dy of [10, 60, 140, 220, 260]) {
      await page.mouse.move(startX, startY + dy);
    }
    await page.mouse.up();

    await expect(page.getByText('Нет сети')).toBeVisible();
    // Список никуда не делся — неудачное обновление не подменяет данные ошибкой.
    await expect(page.locator('[data-setlists-page]')).toBeVisible();
    // Спиннер не залип: фаза вернулась в idle.
    await expect(container).toHaveAttribute('data-pull-to-refresh-phase', 'idle');

    expect(rscErrors, 'RSC-пейлоад запрашивался по сети вместо precache').toEqual([]);

    await context.setOffline(false);
    await context.close();
  });
});
