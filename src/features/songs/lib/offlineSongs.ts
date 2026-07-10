import { getDB } from '@/shared/offline/db';
import { OfflineNoDataError, isDefinitelyOffline, raceNetwork } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, isNetworkTimeout } from '@/shared/offline/networkTimeout';
import type { Song } from '../types';

/**
 * Офлайн read-through для ОДНОЙ песни. Список песен читается через общий
 * `readThrough`+apiCache (useSongs), но полный контент песни downloadManager
 * пишет в отдельный store `songs` (ключ = Song.id). Страница просмотра качала
 * песню напрямую через apiClient без фолбэка — офлайн падала «Песня не найдена»,
 * хотя контент уже лежал в IDB. Здесь тот же паттерн, что и readThrough:
 * network-first, при ошибке сети — отдать сохранённую песню из store `songs`.
 */

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[FIX][songs/offline]', ...args);
}

/** Читает сохранённую песню из IDB store `songs` по id (совпадает с ключом download). */
export async function getCachedSong(id: string | number): Promise<Song | undefined> {
  try {
    const db = await getDB();
    const record = await db.get('songs', String(id));
    return record?.data as Song | undefined;
  } catch (err) {
    debug('IDB read failed', id, err);
    return undefined;
  }
}

/**
 * Кладёт песню в тот же store `songs`, что и массовая загрузка. Вызывается после
 * успешного сетевого чтения, чтобы просмотренная онлайн песня была доступна офлайн
 * даже без явного «скачать всё».
 */
export async function persistCachedSong(song: Song): Promise<void> {
  try {
    const db = await getDB();
    await db.put('songs', { id: String(song.id), data: song, updatedAt: Date.now() });
  } catch (err) {
    debug('IDB write failed', song.id, err);
  }
}

/**
 * Выполняет `fetcher`; при успехе кеширует песню в IDB и возвращает её. При сетевой
 * ошибке ИЛИ таймауте (реальный «офлайн» вешает fetch, а не роняет — см.
 * networkTimeout.ts) отдаёт последнюю сохранённую песню из store `songs`. Если её
 * там нет: сетевую ошибку пробрасываем, таймаут — дожидаемся исходный запрос.
 */
export async function readSongThrough(
  id: string | number,
  fetcher: () => Promise<Song>,
  timeoutMs: number = DEFAULT_NETWORK_TIMEOUT_MS
): Promise<Song> {
  const network = fetcher().then((song) => {
    void persistCachedSong(song);
    return song;
  });
  network.catch(() => {}); // поздний reject после ухода в кеш — не unhandled rejection

  try {
    return await raceNetwork(network, timeoutMs);
  } catch (err) {
    const cached = await getCachedSong(id);
    if (cached !== undefined) {
      console.debug('[FIX][songs/offline] network failed/timed out, served song from IDB', id, err);
      return cached;
    }
    if (isNetworkTimeout(err)) {
      if (isDefinitelyOffline()) {
        debug('offline with empty cache — не ждём сеть', id);
        throw new OfflineNoDataError();
      }
      debug('timeout with empty cache, waiting for slow network', id);
      return network;
    }
    throw err;
  }
}
