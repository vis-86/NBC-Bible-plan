/**
 * Порт src/app/api/directus/[...path]/* (catch-all прокси всех методов через
 * src/lib/directus-proxy.ts). Стриминг тела — `c.req.raw.body` + `duplex: 'half'`
 * внутри proxyToDirectus (тот же fetch-код, что и у Next-версии).
 *
 * Безопасность: роут проксирует запрос в Directus ПОД КУКОЙ пользователя (роль
 * «Чтец»/public), а НЕ под admin-токеном. Admin-доступ к Directus идёт только
 * из server-only кода через getDirectusAdminClient(), не через этот прокси.
 * Раньше прокси выдавал admin-токен по клиентскому заголовку `x-use-admin-token`
 * без всякой авторизации — любой неаутентифицированный запрос получал полный
 * админ-доступ. Заголовок больше не влияет ни на что; роут закрыт сессией.
 */
import { Hono } from 'hono';
import { proxyToDirectus } from '../../../src/lib/directus-proxy';
import { getSession } from '../session';
import { logger } from '../logger';

export const directusProxyRoutes = new Hono();

directusProxyRoutes.all('/*', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const targetPath = c.req.path.replace(/^.*\/directus\//, '');

  // Служебный заголовок с клиента больше не даёт admin-доступ. Удаляем его,
  // чтобы он не протёк в Directus, и никогда не поднимаем привилегии.
  const headers = new Headers(c.req.raw.headers);
  headers.delete('x-use-admin-token');
  const modifiedRequest = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers,
    body: c.req.raw.body,
    // @ts-expect-error - дуплекс необходим при передаче ReadableStream в качестве body
    duplex: 'half',
  });

  logger.debug(`directus proxy: ${c.req.method} ${targetPath} (user ${session.directus_id})`);
  return proxyToDirectus(targetPath, modifiedRequest, false);
});
