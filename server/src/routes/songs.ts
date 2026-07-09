/**
 * Порт группы songs из src/app/api/songs/* (1:1 по поведению).
 */
import { Hono } from 'hono';
import { getSongById, getSongsList } from '../../../src/features/songs/services/songsServer';
import { logger } from '../logger';

export const songsRoutes = new Hono();

/**
 * GET /songs — список песен (краткие карточки).
 */
songsRoutes.get('/', async (c) => {
  try {
    const songs = await getSongsList();
    return c.json({ songs });
  } catch (error) {
    logger.error('[Songs API] list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /songs/:id — одна песня с полным ChordPro-контентом. 404 если не найдена.
 */
songsRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const numericId = Number(id);

    if (!Number.isInteger(numericId) || numericId < 1) {
      return c.json({ error: 'Invalid song id' }, 400);
    }

    const song = await getSongById(numericId);
    if (!song) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json({ song });
  } catch (error) {
    logger.error('[Songs API] detail error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
