/**
 * GET /sync/manifest — пер-элементные версии офлайн-ресурсов.
 *
 * Клиент на каждом запуске сравнивает манифест с сохранёнными версиями и качает только
 * дельту (`src/shared/offline/autoDownload.ts`). Полный список id обязателен: снятая с
 * публикации песня удаляется у клиента ровно потому, что её id пропал из манифеста —
 * tombstones не нужны.
 *
 * Никогда не отдавать пустой манифест при сбое Directus: клиент прочитает его как
 * «всё удалили» и вычистит офлайн-данные. Сбой = 503.
 */
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { getSongVersions } from '../../../src/features/songs/services/songsServer';
import { getSetlistVersions } from '../../../src/features/setlists/services/setlistsServer';
import { getReadingPlan } from '../../../src/lib/directus-data';
import { logger } from '../logger';
import { getSession } from '../session';

const LOG = '[Sync API]';

export interface SyncManifest {
  songs: Array<[string, string]>;
  setlists: Array<[string, string]>;
  plan: string;
}

/**
 * In-memory кеш ответа. Всплеск запусков (утро воскресенья) не должен бить в Directus
 * четырьмя запросами на каждого пользователя.
 */
const CACHE_TTL_MS = 60_000;
let cached: { manifest: SyncManifest; etag: string; at: number } | null = null;

/** Только для тестов: сбрасывает in-memory кеш между кейсами. */
export function __resetSyncCacheForTests(): void {
  cached = null;
}

function etagOf(body: string): string {
  return `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
}

async function buildManifest(): Promise<{ manifest: SyncManifest; etag: string }> {
  const [songs, setlists, plan] = await Promise.all([
    getSongVersions(),
    getSetlistVersions(),
    // У плана нет своего поля версии — берём хеш самого плана. Он статичен весь год,
    // поэтому пересчёт раз в минуту дешевле отдельной схемы версионирования.
    getReadingPlan().then((rows) => createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 12)),
  ]);

  const manifest: SyncManifest = { songs, setlists, plan };
  const body = JSON.stringify(manifest);
  logger.debug(
    `${LOG} built: songs=${songs.length} setlists=${setlists.length} bytes=${Buffer.byteLength(body, 'utf8')}`
  );
  return { manifest, etag: etagOf(body) };
}

export const syncRoutes = new Hono();

syncRoutes.get('/manifest', async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  let entry = cached;
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) {
    logger.debug(`${LOG} in-memory cache hit`);
  } else {
    try {
      const built = await buildManifest();
      entry = { ...built, at: Date.now() };
      cached = entry;
    } catch (error) {
      logger.error(`${LOG} Directus failure — отдаём 503, но НЕ пустой манифест`, error);
      return c.json({ error: 'Sync manifest unavailable' }, 503);
    }
  }

  // Валидация обязательна: отдавать манифест из HTTP-кеша без проверки нельзя,
  // иначе дельта-синк перестанет видеть изменения.
  c.header('Cache-Control', 'no-cache');
  c.header('ETag', entry.etag);

  if (c.req.header('If-None-Match') === entry.etag) {
    logger.info(`${LOG} 304 (клиент уже актуален)`);
    return c.body(null, 304);
  }

  logger.info(`${LOG} 200 songs=${entry.manifest.songs.length} setlists=${entry.manifest.setlists.length}`);
  return c.json(entry.manifest);
});
