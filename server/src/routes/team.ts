/**
 * Команда пользователя: информация о команде, участники и инвайты.
 *
 * Вся группа — за `requireTeam` (команда только из членства по сессии), управление —
 * дополнительно за `requireTeamAdmin`. Участник в `:userId` обязан состоять в команде
 * вызывающего: чужой и несуществующий отвечают одинаково 404.
 *
 * Запись online-only — осознанное исключение из offline-first, как запись песен и сетов.
 */
import { Hono, type Context } from 'hono';
import { isAppRole } from '../../../src/lib/app-roles';
import {
  createMemberResetInvite,
  createTeamInvite,
  getTeam,
  listTeamMembers,
  removeMember,
  setMemberRole,
} from '../../../src/features/team/services/teamServer';
import { requireTeamAdmin } from '../middleware/requireRole';
import { requireTeam } from '../middleware/requireTeam';
import { logger } from '../logger';
import { getSession } from '../session';

export const teamRoutes = new Hono();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Зарегистрирован до роутов, поэтому срабатывает до гейта роли: requireTeam → роль → хендлер.
teamRoutes.use('*', requireTeam);

/**
 * id участника из пути в нижнем регистре: Directus сравнивает uuid без учёта регистра,
 * и сверка «это я?» обязана делать так же. null ⇒ 400 у вызывающего.
 */
function parseUserId(raw: string | undefined): string | null {
  return raw && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

/** Роль из JSON-тела `{ role }`; null — тело не JSON или роль не `AppRole`. */
async function readRole(c: Context) {
  const body = (await c.req.json().catch(() => null)) as { role?: unknown } | null;
  const role = body?.role;
  return isAppRole(role) ? role : null;
}

/** directus_id вызывающего в нижнем регистре; сессию уже проверил `requireTeam`. */
async function callerId(c: Context): Promise<string | null> {
  const session = await getSession(c);
  return session ? session.directus_id.toLowerCase() : null;
}

/**
 * GET /team — своя команда. Любому участнику.
 */
teamRoutes.get('/', async (c) => {
  try {
    const team = await getTeam(c.get('teamId'));
    if (!team) return c.json({ error: 'Not found' }, 404);
    return c.json(team);
  } catch (error) {
    logger.error('[team] info error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /team/members — участники своей команды.
 */
teamRoutes.get('/members', requireTeamAdmin, async (c) => {
  try {
    return c.json(await listTeamMembers(c.get('teamId')));
  } catch (error) {
    logger.error('[team] members error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /team/invites `{ role }` — ссылка-приглашение в свою команду. Команда — из
 * членства по сессии; `team` в теле не читается.
 */
teamRoutes.post('/invites', requireTeamAdmin, async (c) => {
  try {
    const role = await readRole(c);
    if (!role) return c.json({ error: 'Invalid role' }, 400);

    const teamId = c.get('teamId');
    const { url } = await createTeamInvite(teamId, role);
    logger.debug(`[team] invite issued team=${teamId} role=${role}`);
    return c.json({ url }, 201);
  } catch (error) {
    logger.error('[team] invite error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /team/members/:userId/reset — ссылка для смены пароля участника.
 */
teamRoutes.post('/members/:userId/reset', requireTeamAdmin, async (c) => {
  try {
    const userId = parseUserId(c.req.param('userId'));
    if (!userId) return c.json({ error: 'Invalid user id' }, 400);

    const invite = await createMemberResetInvite(c.get('teamId'), userId);
    if (!invite) return c.json({ error: 'Not found' }, 404);

    logger.debug(`[team] reset issued for ${userId}`);
    return c.json({ url: invite.url }, 201);
  } catch (error) {
    logger.error('[team] reset error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * PATCH /team/members/:userId `{ role }` — смена роли участника. Свою роль менять
 * нельзя (409): иначе команда может остаться без администратора.
 */
teamRoutes.patch('/members/:userId', requireTeamAdmin, async (c) => {
  try {
    const userId = parseUserId(c.req.param('userId'));
    if (!userId) return c.json({ error: 'Invalid user id' }, 400);

    const role = await readRole(c);
    if (!role) return c.json({ error: 'Invalid role' }, 400);

    const me = await callerId(c);
    if (!me) return c.json({ error: 'Unauthorized' }, 401);
    if (userId === me) return c.json({ error: 'Cannot change own role' }, 409);

    const changed = await setMemberRole(c.get('teamId'), userId, role);
    if (!changed) return c.json({ error: 'Not found' }, 404);

    return c.json({ success: true });
  } catch (error) {
    logger.error('[team] role change error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * DELETE /team/members/:userId — убрать участника: членство удаляется, аккаунт
 * приостанавливается (не удаляется). Себя убрать нельзя (409).
 */
teamRoutes.delete('/members/:userId', requireTeamAdmin, async (c) => {
  try {
    const userId = parseUserId(c.req.param('userId'));
    if (!userId) return c.json({ error: 'Invalid user id' }, 400);

    const me = await callerId(c);
    if (!me) return c.json({ error: 'Unauthorized' }, 401);
    if (userId === me) return c.json({ error: 'Cannot remove yourself' }, 409);

    const removed = await removeMember(c.get('teamId'), userId);
    if (!removed) return c.json({ error: 'Not found' }, 404);

    return c.json({ success: true });
  } catch (error) {
    logger.error('[team] remove error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
