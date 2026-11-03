/**
 * Общий каталог: опубликованные `public`-песни других команд и их копирование к себе.
 *
 * Только для тех, кто создаёт песни (`requireSongWrite`), — и просмотр, и копия. Команда —
 * только из `requireTeam`; тело и query запроса команду не задают. Online-only: каталог
 * не кешируется (осознанное исключение из offline-first, см. `docs/worship-multitenant-prompt.md`).
 * Предпросмотр песни каталога — существующий `GET /api/public/songs/:id`.
 */
import { Hono } from 'hono';
import {
  CatalogSongNotFoundError,
  copySongToTeam,
  getCatalog,
  SongAlreadyCopiedError,
} from '../../../src/features/songs/services/songsServer';
import { requireSongWrite } from '../middleware/requireRole';
import { requireTeam } from '../middleware/requireTeam';
import { logger } from '../logger';

export const catalogRoutes = new Hono();

// Порядок гейтов: requireTeam (сессия + команда) → роль → хендлер.
catalogRoutes.use('*', requireTeam, requireSongWrite);

/** Числовой id песни из пути. null ⇒ 400 у вызывающего. */
function parseSongId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

/**
 * GET /catalog — публичные песни других команд; `copiedAs` — id нашей копии.
 */
catalogRoutes.get('/', async (c) => {
  try {
    const songs = await getCatalog(c.get('teamId'));
    return c.json({ songs });
  } catch (error) {
    logger.error('[Catalog API] list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /catalog/:id/copy — копия песни каталога в команду сессии.
 * 201 `{ id }` новой песни; 404 — песни нет в каталоге; 409 `{ id }` — уже скопирована.
 */
catalogRoutes.post('/:id/copy', async (c) => {
  const songId = parseSongId(c.req.param('id'));
  if (songId === null) return c.json({ error: 'Invalid song id' }, 400);

  try {
    const id = await copySongToTeam(c.get('teamId'), songId);
    logger.debug(`[Catalog API] copied song ${songId} as ${id}`);
    return c.json({ id }, 201);
  } catch (error) {
    if (error instanceof CatalogSongNotFoundError) return c.json({ error: 'Not found' }, 404);
    if (error instanceof SongAlreadyCopiedError) return c.json({ id: error.existingId }, 409);
    logger.error(`[Catalog API] copy error for song=${songId}:`, error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
