import { getDB } from './db';
import { clearLastKnownUser, getLastKnownUser } from './lastKnownUser';
import { SYNC_ETAG_META_KEY, SYNC_VERSIONS_META_KEY } from './syncVersions';
import { MANIFEST_PLAN_KEY, MANIFEST_SETLISTS_KEY, MANIFEST_SONGS_KEY } from './downloadManager';

/**
 * Офлайн-данные принадлежат пользователю: IDB живёт на устройстве, а читается cache-first,
 * поэтому следующий пользователь увидел бы кеш прежнего, а его outbox реплеился бы под
 * чужой сессией. При входе другого пользователя пользовательское и командное содержимое
 * очищается; текст Писания (общий для всех) остаётся.
 */

/** Ключ в сторе `meta` — id пользователя, которому принадлежат данные устройства. */
export const OFFLINE_OWNER_META_KEY = 'offline:owner';

export type OfflineOwnerResult = 'claimed' | 'same' | 'wiped';

export async function ensureOfflineOwner(userId: string): Promise<OfflineOwnerResult> {
  const db = await getDB();
  const record = await db.get('meta', OFFLINE_OWNER_META_KEY);

  if (!record) {
    // Первый запуск после обновления: данные принадлежат этому пользователю — если только
    // на устройстве не помнят другого (last-known-user ещё прежний: вызывать до его замены).
    const known = await getLastKnownUser<{ directus_id?: unknown }>();
    if (!known || typeof known.directus_id !== 'string' || known.directus_id === '' || known.directus_id === userId) {
      await db.put('meta', { key: OFFLINE_OWNER_META_KEY, value: userId });
      return 'claimed';
    }
  } else if (record.value === userId) {
    return 'same';
  }

  // Одна транзакция: либо вычистили всё и сменили владельца, либо ничего не изменилось
  // (иначе обрыв посреди очистки оставил бы чужие данные под старым владельцем).
  const tx = db.transaction(['songs', 'songState', 'outbox', 'apiCache', 'manifest', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('songs').clear(),
    tx.objectStore('songState').clear(),
    tx.objectStore('outbox').clear(),
    tx.objectStore('apiCache').clear(),
    tx.objectStore('manifest').delete(MANIFEST_SONGS_KEY),
    tx.objectStore('manifest').delete(MANIFEST_PLAN_KEY),
    tx.objectStore('manifest').delete(MANIFEST_SETLISTS_KEY),
    tx.objectStore('meta').delete(SYNC_VERSIONS_META_KEY),
    tx.objectStore('meta').delete(SYNC_ETAG_META_KEY),
    tx.objectStore('meta').put({ key: OFFLINE_OWNER_META_KEY, value: userId }),
    tx.done,
  ]);
  return 'wiped';
}

/**
 * Вход/регистрация/активация другого пользователя: прежний last-known-user снимается до
 * навигации, чтобы дашборд не стартовал «от имени» прежнего. Без id в ответе сравнивать
 * не с чем — ничего не трогаем (AuthProvider разберётся по ответу сессии).
 */
export async function forgetForeignLastKnownUser(newUserId: unknown): Promise<void> {
  if (typeof newUserId !== 'string' || newUserId === '') return;
  const known = await getLastKnownUser<{ directus_id?: unknown }>();
  if (known && known.directus_id !== newUserId) await clearLastKnownUser();
}
