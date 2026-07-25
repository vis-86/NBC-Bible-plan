import { config } from 'dotenv';

/**
 * BFF — отдельный процесс (не Next), `.env.local` сам себя не подхватывает.
 * В проде переменные приходят из окружения контейнера (docker compose --env-file),
 * NODE_ENV=production там всегда выставлен — локальный файл не трогаем.
 */
if (process.env.NODE_ENV !== 'production') {
  config({ path: '.env.local' });
}
