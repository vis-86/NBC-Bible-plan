/**
 * Порт src/app/api/directus/[...path]/* (catch-all прокси всех методов через
 * src/lib/directus-proxy.ts). Стриминг тела — `c.req.raw.body` + `duplex: 'half'`
 * внутри proxyToDirectus (тот же fetch-код, что и у Next-версии).
 */
import { Hono } from 'hono';
import { proxyToDirectus } from '../../../src/lib/directus-proxy';
import { logger } from '../logger';

export const directusProxyRoutes = new Hono();

directusProxyRoutes.all('/*', async (c) => {
  const targetPath = c.req.path.replace(/^.*\/directus\//, '');

  // Проверяем, нужен ли admin token для этого запроса.
  const useAdminToken = c.req.header('x-use-admin-token') === 'true';

  // Удаляем служебный заголовок, чтобы он не попал в Directus.
  const headers = new Headers(c.req.raw.headers);
  headers.delete('x-use-admin-token');
  const modifiedRequest = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers,
    body: c.req.raw.body,
    // @ts-expect-error - дуплекс необходим при передаче ReadableStream в качестве body
    duplex: 'half',
  });

  logger.debug(`directus proxy: ${c.req.method} ${targetPath} admin=${useAdminToken}`);
  return proxyToDirectus(targetPath, modifiedRequest, useAdminToken);
});
