/**
 * Персист рукописных пометок (M10, фаза 3). Узкий API по образцу `personalKeyStore`:
 *
 *   чтение → read-through (сеть с таймаутом + fail fast офлайн) → IDB стор `songState`
 *   запись → outbox (write-ahead) → replay при появлении сети → Directus
 *
 * Прямого POST здесь нет намеренно: ветвление online/offline завело бы второй источник
 * истины рядом с очередью.
 */
import { getDB } from '@/shared/offline/db';
import { isDefinitelyOffline, OfflineNoDataError, raceNetwork } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, isNetworkTimeout } from '@/shared/offline/networkTimeout';
import { enqueueSongAnnotations } from '@/shared/offline/outbox';
import { apiClient } from '@/shared/services/api/client';
import type { SongAnnotations, SongStroke } from '../types';

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[songs/annotations]', ...args);
}

export const EMPTY_SONG_ANNOTATIONS: SongAnnotations = { strokes: [], updatedAt: 0 };

/**
 * Ключ записи в сторе `songState`. ЕДИНСТВЕННЫЙ источник — импортируется и писателем
 * (`persistAnnotations`, прогрев в `downloadManager`), и читателем (`getCachedAnnotations`).
 */
export function songStateKey(songId: string | number): string {
  return String(songId);
}

const listeners = new Set<() => void>();

/** Подписка на изменения (страница песни обновляет слой без повторного запроса). */
export function subscribeSongAnnotations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

export async function getCachedAnnotations(songId: string | number): Promise<SongAnnotations | undefined> {
  try {
    const db = await getDB();
    const record = await db.get('songState', songStateKey(songId));
    if (!record) return undefined;
    return { strokes: (record.strokes as SongStroke[]) ?? [], updatedAt: record.updatedAt ?? 0 };
  } catch (err) {
    debug('IDB read failed', songId, err);
    return undefined;
  }
}

export async function persistAnnotations(songId: string | number, annotations: SongAnnotations): Promise<void> {
  try {
    const db = await getDB();
    await db.put('songState', {
      songId: songStateKey(songId),
      strokes: annotations.strokes,
      updatedAt: annotations.updatedAt,
    });
  } catch (err) {
    debug('IDB write failed', songId, err);
  }
}

/** Сетевое чтение пометок. Отдельная функция — её же зовёт прогрев в downloadManager. */
export function fetchAnnotations(songId: string | number): Promise<SongAnnotations> {
  return apiClient
    // basePath добавляет сам apiClient — обёртка в getApiPath давала `/app/app/api/...`
    // и вечный 404, неотличимый от «пометок ещё нет» (поймано офлайн-e2e T15).
    .get<{ annotations: SongAnnotations }>(`/api/songs/${songId}/state`)
    .then((res) => res.annotations ?? EMPTY_SONG_ANNOTATIONS);
}

/**
 * Read-through: сеть с таймаутом, при неудаче — IDB. `navigator.onLine === false`
 * с пустым кэшем ⇒ fail fast: реальный офлайн ВЕШАЕТ запрос, а не отклоняет его,
 * и ожидание здесь бесконечно by construction.
 *
 * Пометок нет нигде ⇒ пустой набор, а не ошибка: «ещё не рисовал» — нормальное
 * состояние, и падать на нём экран песни не должен.
 *
 * Ответ сети применяется по LWW, а не безусловно: правка, нарисованная офлайн, лежит
 * в outbox, и открытая до replay песня получила бы с сервера СТАРОЕ состояние — оно
 * затёрло бы свежую локальную запись и стёрло пометки с экрана до следующего захода.
 */
export async function readAnnotations(
  songId: string | number,
  fetcher: () => Promise<SongAnnotations> = () => fetchAnnotations(songId),
  timeoutMs: number = DEFAULT_NETWORK_TIMEOUT_MS
): Promise<SongAnnotations> {
  const network = fetcher().then(async (annotations) => {
    const cached = await getCachedAnnotations(songId);
    if (cached && cached.updatedAt > annotations.updatedAt) {
      debug('network state is older than local — keeping local', songId, {
        network: annotations.updatedAt,
        local: cached.updatedAt,
      });
      return cached;
    }
    void persistAnnotations(songId, annotations);
    return annotations;
  });
  network.catch(() => {}); // поздний reject после ухода в кеш — не unhandled rejection

  try {
    return await raceNetwork(network, timeoutMs);
  } catch (err) {
    const cached = await getCachedAnnotations(songId);
    if (cached !== undefined) {
      debug('network failed/timed out, served annotations from IDB', songId, err);
      return cached;
    }
    if (isNetworkTimeout(err) && !isDefinitelyOffline()) {
      debug('timeout with empty cache, waiting for slow network', songId);
      return network.catch(() => EMPTY_SONG_ANNOTATIONS);
    }
    debug('no annotations anywhere — empty set', songId, err instanceof OfflineNoDataError ? 'offline' : err);
    return EMPTY_SONG_ANNOTATIONS;
  }
}

/**
 * Запись: оптимистично в IDB + в очередь. `updatedAt` монотонный — две правки в одном
 * тике иначе получают одинаковую метку и LWW перестаёт их различать.
 */
let lastWriteTs = 0;
export async function writeAnnotations(songId: string | number, strokes: SongStroke[]): Promise<SongAnnotations> {
  const now = Date.now();
  lastWriteTs = now > lastWriteTs ? now : lastWriteTs + 1;
  const annotations: SongAnnotations = { strokes, updatedAt: lastWriteTs };

  await persistAnnotations(songId, annotations);
  notify();
  await enqueueSongAnnotations(Number(songId), { strokes, updatedAt: annotations.updatedAt });
  debug('queued', songId, { strokes: strokes.length, updatedAt: annotations.updatedAt });
  return annotations;
}
