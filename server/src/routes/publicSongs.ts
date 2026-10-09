/**
 * Публичная песня по ссылке «Поделиться» (`/s?id=`) — единственный путь к песням без сессии.
 * Видимость решает сервер (`songs.visibility`); закрытая и несуществующая песня неразличимы.
 */
import { Hono } from 'hono';
import { getPublicSong } from '../../../src/features/songs/services/songsServer';
import { logger } from '../logger';

export const publicSongsRoutes = new Hono();

publicSongsRoutes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid song id' }, 400);
  try {
    const song = await getPublicSong(id);
    if (!song) return c.json({ error: 'Not found' }, 404);
    return c.json({ song });
  } catch (error) {
    logger.error('[Public Songs API] detail error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
