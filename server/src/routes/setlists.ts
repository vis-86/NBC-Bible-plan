/**
 * CRUD-роуты сетлистов (M7). Чтение — под сессией, запись — под `requireSetlistWrite`
 * (Directus права — второй рубеж, реальный гейт здесь). См. `.ai-factory/plans/feature-setlists.md`.
 *
 * Вся группа — за `requireTeam`: сеты видны и меняются только в пределах команды
 * пользователя (`c.get('teamId')`). Сет другой команды — 404, как несуществующий.
 */
import { Hono } from 'hono';
import {
  createSetlist,
  deleteSetlist,
  getSetlistDetail,
  getSetlistsList,
  SetlistNotFoundError,
  UnknownSongIdError,
  updateSetlist,
} from '../../../src/features/setlists/services/setlistsServer';
import { CreateSetlistSchema, firstZodError, UpdateSetlistSchema } from '../../../src/lib/validators/setlists.schemas';
import { requireSetlistWrite } from '../middleware/requireRole';
import { requireTeam } from '../middleware/requireTeam';
import { logger } from '../logger';
import { getSession } from '../session';

export const setlistsRoutes = new Hono();

// Зарегистрирован до роутов, поэтому срабатывает до гейта роли: requireTeam → роль → хендлер.
setlistsRoutes.use('*', requireTeam);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

setlistsRoutes.get('/', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    logger.debug(`[setlists] list requested by ${session.directus_id}`);
    const setlists = await getSetlistsList(c.get('teamId'));
    return c.json({ setlists });
  } catch (error) {
    logger.error('[setlists] list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

setlistsRoutes.get('/:id', async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    if (!id || !UUID_RE.test(id)) return c.json({ error: 'Invalid setlist id' }, 400);

    logger.debug(`[setlists] detail requested id=${id} by ${session.directus_id}`);
    const setlist = await getSetlistDetail(c.get('teamId'), id);
    if (!setlist) return c.json({ error: 'Not found' }, 404);

    return c.json({ setlist });
  } catch (error) {
    logger.error('[setlists] detail error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

setlistsRoutes.post('/', requireSetlistWrite, async (c) => {
  try {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json().catch(() => null);
    const parsed = CreateSetlistSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: firstZodError(parsed.error) }, 400);

    const id = await createSetlist({
      teamId: c.get('teamId'),
      title: parsed.data.title,
      date: parsed.data.date ?? null,
      songIds: parsed.data.songIds,
      createdBy: session.directus_id,
    });
    return c.json({ id }, 201);
  } catch (error) {
    if (error instanceof UnknownSongIdError) {
      return c.json({ error: 'Unknown song id' }, 400);
    }
    logger.error('[setlists] create error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

setlistsRoutes.patch('/:id', requireSetlistWrite, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id || !UUID_RE.test(id)) return c.json({ error: 'Invalid setlist id' }, 400);

    const body = await c.req.json().catch(() => null);
    const parsed = UpdateSetlistSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: firstZodError(parsed.error) }, 400);

    logger.debug(`[setlists] update id=${id}`);
    await updateSetlist(c.get('teamId'), id, parsed.data);
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof SetlistNotFoundError) return c.json({ error: 'Not found' }, 404);
    if (error instanceof UnknownSongIdError) {
      return c.json({ error: 'Unknown song id' }, 400);
    }
    logger.error('[setlists] update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

setlistsRoutes.delete('/:id', requireSetlistWrite, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id || !UUID_RE.test(id)) return c.json({ error: 'Invalid setlist id' }, 400);

    logger.debug(`[setlists] delete id=${id}`);
    await deleteSetlist(c.get('teamId'), id);
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof SetlistNotFoundError) return c.json({ error: 'Not found' }, 404);
    logger.error('[setlists] delete error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
