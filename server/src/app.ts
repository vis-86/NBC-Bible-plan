/**
 * Фабрика Hono-приложения BFF отдельно от listen — для тестов через
 * `app.request()`. Все роуты живут под `{basePath}/api` (default /app/api) —
 * ровно те же URL, что сейчас отдаёт Next за nginx.
 */
import { Hono } from 'hono';
import { basePath } from './env';
import { logger } from './logger';
import { authRoutes } from './routes/auth';

export function createApp() {
  const app = new Hono().basePath(`${basePath()}/api`);

  app.use('*', async (c, next) => {
    const start = performance.now();
    await next();
    const ms = Math.round(performance.now() - start);
    logger.debug(`${c.req.method} ${c.req.path} -> ${c.res.status} ${ms}ms`);
  });

  app.onError((err, c) => {
    logger.error(`unhandled error on ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  // Liveness-пинг, поведение 1:1 с src/app/api/health/route.ts — от него
  // зависит клиентский sync-гейт (isServerReachable).
  app.get('/health', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.body(null, 204);
  });

  app.route('/auth', authRoutes);

  return app;
}
