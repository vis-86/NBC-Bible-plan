import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

/**
 * Минимальный локальный сервер для e2e (T13, `.ai-factory/plans/feature-static-export-hono-bff.md`):
 * отдаёт статический `out/` под basePath (как nginx `location /app` в проде,
 * см. deploy/nginx/conf.d/tls.conf) + проксирует `{basePath}/api/*` на локальный
 * BFF (`yarn bff:start`, отдельный процесс). Не используется в проде — там nginx +
 * отдельный `static`-образ (deploy/Dockerfile).
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/app';
const port = Number(process.env.STATIC_SERVE_PORT || 8080);
const bffPort = Number(process.env.BFF_PORT || 3001);
const bffTarget = `http://localhost:${bffPort}`;

const app = new Hono();

app.all(`${basePath}/api/*`, async (c) => {
  const url = new URL(c.req.url);
  const target = `${bffTarget}${url.pathname}${url.search}`;
  const res = await fetch(target, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
    // @ts-expect-error — undici требует duplex для стриминговых тел, DOM lib его не описывает
    duplex: 'half',
  });
  return new Response(res.body, { status: res.status, headers: res.headers });
});

/** Мимикрирует nginx `try_files $uri $uri.html $uri/ =404` (см. tls.conf) для flat-HTML export'а Next. */
function rewriteRequestPath(path: string): string {
  const rest = path.slice(basePath.length) || '/';
  if (rest === '/') return '/index.html';
  const last = rest.split('/').pop() ?? '';
  return last.includes('.') ? rest : `${rest}.html`;
}

app.get(`${basePath}/*`, serveStatic({ root: 'out', rewriteRequestPath }));

app.get('/', (c) => c.redirect(basePath));

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[static-serve] listening on :${info.port}, ${basePath} -> out/, ${basePath}/api -> ${bffTarget}`);
});
