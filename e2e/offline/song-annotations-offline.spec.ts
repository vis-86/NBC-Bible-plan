import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { appPath, login, waitForServiceWorkerReady } from './helpers';

/**
 * T15 (M10, `.ai-factory/plans/feature-song-annotations.md`): прод-контур офлайна для
 * рукописных пометок. Полный круг записи:
 *
 *   рисование БЕЗ сети → write-ahead outbox → reload офлайн (пометки на месте) →
 *   сеть вернулась → replay довёз запись в Directus → чистый IDB («другое устройство»)
 *   читает пометки с сервера.
 *
 * Пометки — личные данные тестового аккаунта, а не общий контент, поэтому фикстур
 * самоочищающийся: `afterAll` возвращает песне пустой набор через тот же PUT, что
 * пишет приложение (прод-Directus не должен копить мусор от прогонов — см. CLAUDE.md).
 *
 * Логин — РОВНО ОДИН на файл: BFF рейт-лимитит `/api/auth/login` (10/15 мин на IP),
 * а полный прогон `e2e:offline` уже расходует этот бюджет остальными спеками.
 */

const IDB_NAME = 'bible-plan-offline';

let songId: number;
let storageState: Awaited<ReturnType<BrowserContext['storageState']>>;

/** Записи стора IDB как есть — проверяем очередь и кэш, а не их отражение в UI. */
async function readStore(page: Page, store: 'outbox' | 'songState'): Promise<unknown[]> {
  return page.evaluate(async (args) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // Без версии — открытие не триггерит upgrade и не мешает приложению.
      const req = indexedDB.open(args.name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      if (!db.objectStoreNames.contains(args.store)) return [];
      return await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(args.store, 'readonly').objectStore(args.store).getAll();
        req.onsuccess = () => resolve(req.result as unknown[]);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }, { name: IDB_NAME, store });
}

/** Рисует один штрих мышью поверх первой якорной строки песни. */
async function drawStroke(page: Page): Promise<void> {
  const line = page.locator('[data-song-line-section][data-song-line-index]').first();
  await expect(line).toBeVisible();
  const box = (await line.boundingBox())!;
  const y = box.y + box.height / 2;
  const startX = box.x + 8;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  // Серия шагов, а не один move: штрих из одной точки вырожденный, и часть
  // инструментов его осознанно не коммитит.
  for (const dx of [20, 45, 70, 95]) {
    await page.mouse.move(startX + dx, y + (dx % 20 === 0 ? 4 : -4));
  }
  await page.mouse.up();
}

/** Собирает консольные ошибки RSC — офлайн-страница обязана отдавать контент без них. */
function watchRscErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().includes('Failed to fetch RSC payload')) errors.push(msg.text());
  });
  return errors;
}

test.describe('Пометки песни — офлайн (T15)', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page);
    storageState = await context.storageState();

    const songsRes = await context.request.get(appPath('/api/songs'));
    expect(songsRes.ok(), 'GET /api/songs должен быть доступен под сессией e2e-аккаунта').toBe(true);
    const { songs } = (await songsRes.json()) as { songs: Array<{ id: string }> };
    expect(songs.length, 'в каталоге должна быть хотя бы одна песня').toBeGreaterThan(0);
    songId = Number(songs[0].id);

    // Стартуем с заведомо пустого набора: прошлый прогон мог упасть до очистки.
    await context.request.put(appPath(`/api/songs/${songId}/state`), {
      data: { strokes: [], updatedAt: Date.now() },
    });
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!songId) return;
    const context = await browser.newContext({ storageState });
    await context.request.put(appPath(`/api/songs/${songId}/state`), {
      data: { strokes: [], updatedAt: Date.now() },
    });
    await context.close();
  });

  test('нарисовано офлайн → переживает reload → уезжает в Directus при возврате сети', async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    const rscErrors = watchRscErrors(page);

    // Прогрев: онлайн-визит кладёт песню в IDB (readSongThrough), а SW берёт
    // страницу под контроль — без этого офлайн-заход упрётся в белый экран.
    await page.goto(appPath(`/dashboard/song?id=${songId}`));
    await waitForServiceWorkerReady(page);
    await expect(page.locator('[data-song-page]')).toBeVisible();
    await expect(page.locator('[data-song-ink-open]')).toBeVisible();

    // page.route не перехватывает запросы, прошедшие через SW — офлайн только контекстом.
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('[data-song-page]')).toBeVisible();

    await page.locator('[data-song-ink-open]').click();
    await expect(page.locator('[data-song-ink-toolbar]')).toBeVisible();
    await drawStroke(page);
    await page.locator('[data-song-ink-done]').click();
    await expect(page.locator('[data-song-ink-toolbar]')).toBeHidden();

    // Запись ушла в очередь и в локальный кэш ДО всякой сети — это write-ahead.
    const queued = (await readStore(page, 'outbox')) as Array<{ kind?: string; songId?: number }>;
    expect(
      queued.filter((r) => r.kind === 'songAnnotations' && r.songId === songId),
      'офлайн-правка обязана лежать в outbox'
    ).toHaveLength(1);
    const cached = (await readStore(page, 'songState')) as Array<{ songId: string; strokes: unknown[] }>;
    expect(cached.find((r) => r.songId === String(songId))?.strokes.length).toBe(1);

    // Перезагрузка без сети: пометки читаются из IDB, страница отдаёт контент.
    await page.reload();
    await expect(page.locator('[data-song-page]')).toBeVisible();
    await expect(page.locator('[data-song-ink-open-has-annotations]')).toBeVisible();
    await expect(page.getByText('Нет соединения')).not.toBeVisible();

    // Сеть вернулась → replay. Reload — штатный триггер синка (старт приложения),
    // и заодно проверяет, что сетевое чтение не затирает ещё не отправленную правку.
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator('[data-song-page]')).toBeVisible();
    await expect(page.locator('[data-song-ink-open-has-annotations]')).toBeVisible();

    await expect
      .poll(
        async () => {
          const rest = (await readStore(page, 'outbox')) as Array<{ kind?: string }>;
          return rest.filter((r) => r.kind === 'songAnnotations').length;
        },
        { message: 'outbox не разгрузился после возврата сети', timeout: 15_000 }
      )
      .toBe(0);

    const serverState = await context.request.get(appPath(`/api/songs/${songId}/state`));
    expect(serverState.ok()).toBe(true);
    const { annotations } = (await serverState.json()) as {
      annotations: { strokes: unknown[]; updatedAt: number };
    };
    expect(annotations.strokes, 'штрих не доехал до Directus').toHaveLength(1);

    expect(rscErrors, 'RSC-пейлоад запрашивался по сети вместо precache').toEqual([]);
    await context.close();
  });

  test('другое «устройство» (чистый IDB) читает пометки с сервера', async ({ browser }) => {
    // Новый контекст = пустой IndexedDB при той же сессии: ровно то, что видит
    // второй телефон того же пользователя.
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    const rscErrors = watchRscErrors(page);

    await page.goto(appPath(`/dashboard/song?id=${songId}`));
    await expect(page.locator('[data-song-page]')).toBeVisible();
    await expect(page.locator('[data-song-ink-open-has-annotations]')).toBeVisible();

    await expect
      .poll(async () => {
        const cached = (await readStore(page, 'songState')) as Array<{ songId: string; strokes: unknown[] }>;
        return cached.find((r) => r.songId === String(songId))?.strokes.length ?? 0;
      }, { message: 'прочитанные с сервера пометки не осели в IDB' })
      .toBe(1);

    expect(rscErrors).toEqual([]);
    await context.close();
  });
});
