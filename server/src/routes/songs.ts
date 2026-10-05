/**
 * Порт группы songs из src/app/api/songs/* (1:1 по поведению).
 */
import { Hono } from 'hono';
import {
  createSong,
  getSongById,
  getSongsList,
  SongNotFoundError,
  updateSong,
} from '../../../src/features/songs/services/songsServer';
import { getSongAnnotations, putSongAnnotations } from '../../../src/features/songs/services/songStateServer';
import { firstZodError } from '../../../src/lib/validators/setlists.schemas';
import { CreateSongSchema, UpdateSongSchema } from '../../../src/lib/validators/songs.schemas';
import { SongAnnotationsSchema } from '../../../src/lib/validators/songState.schemas';
import { requireSongWrite } from '../middleware/requireRole';
import { logger } from '../logger';
import { getSession } from '../session';

export const songsRoutes = new Hono();

/** Числовой id песни из пути. null ⇒ 400 у вызывающего. */
function parseSongId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

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
    const songId = parseSongId(c.req.param('id'));
    if (songId === null) {
      return c.json({ error: 'Invalid song id' }, 400);
    }

    const song = await getSongById(songId);
    if (!song) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json({ song });
  } catch (error) {
    logger.error('[Songs API] detail error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /songs/:id/state — личные пометки текущего пользователя к песне.
 *
 * Роль не проверяется: пометки личные, их ведёт любой авторизованный, включая `reader`.
 * Владелец берётся из сессии — чужие пометки запросить нечем.
 */
songsRoutes.get('/:id/state', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const songId = parseSongId(c.req.param('id'));
  if (songId === null) return c.json({ error: 'Invalid song id' }, 400);

  try {
    logger.debug(`[SongState] read song=${songId} by ${session.directus_id}`);
    const annotations = await getSongAnnotations(session.directus_id, songId);
    return c.json({ annotations });
  } catch (error) {
    logger.error(`[SongState] read failed for song=${songId}:`, error);
    return c.json({ error: 'Upstream unavailable' }, 502);
  }
});

/**
 * PUT /songs/:id/state — upsert пометок. LWW: запись со старым `updatedAt` отбрасывается,
 * иначе отложенный replay офлайн-очереди затёр бы более свежую правку с другого устройства.
 * Клиент получает 200 и в обоих случаях — отброс не ошибка, а штатный исход гонки.
 */
songsRoutes.put('/:id/state', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const songId = parseSongId(c.req.param('id'));
  if (songId === null) return c.json({ error: 'Invalid song id' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = SongAnnotationsSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: firstZodError(parsed.error) }, 400);

  try {
    logger.debug(
      `[SongState] write song=${songId} by ${session.directus_id}: ${parsed.data.strokes.length} stroke(s)`
    );
    // user_id — только из сессии; всё, что пришло в теле про владельца, отброшено схемой.
    const result = await putSongAnnotations(session.directus_id, songId, parsed.data);
    if (result.status === 'stale') {
      logger.warn(`[SongState] stale write dropped for song=${songId}`);
      return c.json({ status: 'stale', updatedAt: result.currentUpdatedAt });
    }
    return c.json({ status: 'ok', updatedAt: parsed.data.updatedAt });
  } catch (error) {
    logger.error(`[SongState] write failed for song=${songId}:`, error);
    return c.json({ error: 'Upstream unavailable' }, 502);
  }
});

/**
 * POST /songs — создание песни (M9). Только `musician_editor` (`requireSongWrite`):
 * реальный гейт здесь, Directus-права — второй рубеж, ходим туда админ-токеном.
 *
 * Тело — готовый ChordPro; `slug`, `sort` и `status` задаёт сервер (см. `createSong`).
 * Запись online-only, поэтому outbox в этом пути не участвует.
 */
songsRoutes.post('/', requireSongWrite, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSongSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: firstZodError(parsed.error) }, 400);

  try {
    const id = await createSong(parsed.data);
    logger.debug(`[Songs API] created song ${id}`);
    return c.json({ id }, 201);
  } catch (error) {
    logger.error('[Songs API] create error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * PUT /songs/:id — правка песни (M9). Патч частичный, конфликт двух редакторов —
 * last-write-wins (решение 1 плана). Версию в sync-манифесте поднимает сам Directus
 * через `date_updated`, поэтому отдельной инвалидации кэша здесь нет.
 */
songsRoutes.put('/:id', requireSongWrite, async (c) => {
  const songId = parseSongId(c.req.param('id'));
  if (songId === null) return c.json({ error: 'Invalid song id' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSongSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: firstZodError(parsed.error) }, 400);

  try {
    await updateSong(songId, parsed.data);
    logger.debug(`[Songs API] updated song ${songId}`);
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof SongNotFoundError) return c.json({ error: 'Not found' }, 404);
    logger.error(`[Songs API] update error for song=${songId}:`, error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
