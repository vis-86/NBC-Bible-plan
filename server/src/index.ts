import './loadEnv';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { basePath, bffPort } from './env';
import { logger } from './logger';

const app = createApp();
const port = bffPort();

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`listening on :${info.port}, routes under ${basePath()}/api`);
});
