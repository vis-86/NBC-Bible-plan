/**
 * Серверный доступ к личному состоянию песни (`song_user_state`) через admin-клиент
 * Directus. Клиент в Directus напрямую не ходит — только через эти функции + BFF-роуты.
 *
 * БЕЗОПАСНОСТЬ: `userId` сюда приходит ИСКЛЮЧИТЕЛЬНО из iron-session вызывающего роута.
 * Никогда не подставлять его из тела запроса или заголовка — BFF ходит админ-токеном,
 * и права Directus здесь второй рубеж, а не защита.
 */
import { createHash } from 'node:crypto';
import { createItem, readItem, updateItem } from '@directus/sdk';
import type { DirectusClient, RestClient } from '@directus/sdk';
import { getDirectusAdminClient } from '@/lib/directus';
import type { SongAnnotations, SongStroke } from '../types';

const LOG = '[SongState API]';

/**
 * Namespace для детерминированного `id` записи (UUIDv5 от `"{user_id}:{song}"`).
 *
 * Пара `(user_id, song)` обязана быть уникальной, но Directus REST не умеет составные
 * индексы (`is_unique` живёт только на одном поле, эндпоинта для индексов нет). Считаем
 * первичный ключ детерминированно — дубликат становится невозможен по построению, его
 * ловит сам PK, без единой правки схемы.
 *
 * ВНИМАНИЕ: смена этой константы осиротит ВСЕ существующие записи.
 */
export const SONG_STATE_ID_NAMESPACE = '3f1d5c8a-9b42-4e17-8c6f-2a7d0e4b9153';

type SongUserStateRow = {
  id: string;
  user_id: string;
  song: number;
  key: string | null;
  strokes: SongStroke[] | null;
  scroll_speed: number | null;
  updated_at: string | null;
};

/**
 * Локальная схема для admin-клиента — по той же причине, что и в `setlistsServer`:
 * общая `DirectusSchema` описывает коллекции объектами, а SDK v20 ждёт массивы и
 * иначе сужает collection-параметр до `never`.
 */
interface SongStateSchema {
  song_user_state: SongUserStateRow[];
}

type SongStateClient = DirectusClient<SongStateSchema> & RestClient<SongStateSchema>;

function getClient(): SongStateClient {
  return getDirectusAdminClient() as unknown as SongStateClient;
}

/** UUIDv5 (SHA-1, RFC 4122) — 20 строк своего кода вместо зависимости `uuid`. */
function uuidV5(name: string, namespace: string): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  if (nsBytes.length !== 16) throw new Error('Invalid UUID namespace');

  const hash = createHash('sha1').update(nsBytes).update(Buffer.from(name, 'utf8')).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // версия 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // вариант RFC 4122

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Детерминированный PK записи состояния. Единственный источник — эта функция:
 * и писатель, и читатель обязаны звать её, а не собирать id самостоятельно.
 */
export function songStateId(userId: string, songId: number): string {
  return uuidV5(`${userId}:${songId}`, SONG_STATE_ID_NAMESPACE);
}

/** Пустые пометки — то, что отдаём, когда записи ещё нет. */
export const EMPTY_ANNOTATIONS: SongAnnotations = { strokes: [], updatedAt: 0 };

function rowToAnnotations(row: Pick<SongUserStateRow, 'strokes' | 'updated_at'>): SongAnnotations {
  return {
    strokes: Array.isArray(row.strokes) ? row.strokes : [],
    updatedAt: row.updated_at ? Date.parse(row.updated_at) || 0 : 0,
  };
}

/**
 * Пометки пользователя к песне. Записи нет ⇒ пустой набор (а не 404): для клиента
 * «ещё не рисовал» и «нарисовал и стёр всё» — одно и то же состояние.
 */
export async function getSongAnnotations(userId: string, songId: number): Promise<SongAnnotations> {
  const client = getClient();
  const id = songStateId(userId, songId);

  try {
    const row = await client.request(readItem('song_user_state', id, { fields: ['strokes', 'updated_at'] }));
    if (!row) return EMPTY_ANNOTATIONS;
    const annotations = rowToAnnotations(row);
    console.debug(`${LOG} read song=${songId}: ${annotations.strokes.length} stroke(s)`);
    return annotations;
  } catch (error) {
    // Directus отвечает 403/404 на отсутствующий item — это норма, не сбой.
    if (isNotFound(error)) {
      console.debug(`${LOG} read song=${songId}: no record yet`);
      return EMPTY_ANNOTATIONS;
    }
    throw error;
  }
}

export type WriteAnnotationsResult = { status: 'written' } | { status: 'stale'; currentUpdatedAt: number };

/**
 * Upsert пометок с LWW на сервере.
 *
 * Отброс устаревшей записи обязателен: отложенный replay офлайн-очереди может прийти
 * позже, чем более свежая правка с другого устройства, и без этой проверки затёр бы её.
 */
export async function putSongAnnotations(
  userId: string,
  songId: number,
  annotations: SongAnnotations
): Promise<WriteAnnotationsResult> {
  const client = getClient();
  const id = songStateId(userId, songId);
  const payload = {
    strokes: annotations.strokes,
    updated_at: new Date(annotations.updatedAt).toISOString(),
  };

  let existing: Pick<SongUserStateRow, 'updated_at'> | null = null;
  try {
    existing = await client.request(readItem('song_user_state', id, { fields: ['updated_at'] }));
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  if (existing) {
    const currentUpdatedAt = rowToAnnotations({ strokes: null, updated_at: existing.updated_at }).updatedAt;
    if (currentUpdatedAt > annotations.updatedAt) {
      console.warn(`${LOG} stale write for song=${songId}: incoming ${annotations.updatedAt} < stored ${currentUpdatedAt}`);
      return { status: 'stale', currentUpdatedAt };
    }
    await client.request(updateItem('song_user_state', id, payload));
    console.debug(`${LOG} updated song=${songId}: ${annotations.strokes.length} stroke(s)`);
    return { status: 'written' };
  }

  try {
    await client.request(createItem('song_user_state', { id, user_id: userId, song: songId, ...payload }));
    console.debug(`${LOG} created song=${songId}: ${annotations.strokes.length} stroke(s)`);
  } catch (error) {
    // Гонка двух параллельных PUT: запись успели создать между read и create.
    // Плодить вторую нельзя (её и не даст PK) — до-обновляем существующую.
    if (!isNotUnique(error)) throw error;
    console.debug(`${LOG} create raced for song=${songId}, falling back to update`);
    await client.request(updateItem('song_user_state', id, payload));
  }
  return { status: 'written' };
}

/** Directus-ошибка «нет такого item» (403 под скоупом прав или 404). */
function isNotFound(error: unknown): boolean {
  return directusStatus(error) === 403 || directusStatus(error) === 404;
}

function isNotUnique(error: unknown): boolean {
  const errors = (error as { errors?: Array<{ extensions?: { code?: string } }> })?.errors;
  return errors?.some((e) => e.extensions?.code === 'RECORD_NOT_UNIQUE') ?? false;
}

function directusStatus(error: unknown): number | undefined {
  const response = (error as { response?: { status?: number } })?.response;
  return response?.status ?? (error as { status?: number })?.status;
}
