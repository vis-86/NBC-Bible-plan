'use client';

import { useCallback, useState } from 'react';
import { setlistsApi } from '@/shared/services/api/endpoints';
import { getDB } from '@/shared/offline/db';
import { setlistCacheKey, SETLISTS_LIST_CACHE_KEY } from '../lib/offlineSetlists';
import { resetSetlistsCache } from './useSetlists';
import type { CreateSetlistPayload, UpdateSetlistPayload } from '../types';

/**
 * Инвалидирует apiCache списка и (если известен id) детали сета — следующий readThrough
 * увидит свежие данные. Ключи берём ТОЛЬКО из `offlineSetlists` — один источник и для
 * писателя, и для читателя, иначе экраны читают из кеша, который никто не чистит.
 */
async function invalidateCache(id?: string | null): Promise<void> {
  resetSetlistsCache();
  try {
    const db = await getDB();
    await db.delete('apiCache', SETLISTS_LIST_CACHE_KEY);
    if (id) await db.delete('apiCache', setlistCacheKey(id));
  } catch (err) {
    console.debug('[useSaveSetlist] cache invalidation failed', err);
  }
}

/**
 * Сохранение сета — создание (POST) и правка (PATCH), с инвалидацией кеша.
 * Запись сетов сознательно online-only (см. `docs/offline-pwa.md`), поэтому
 * outbox тут не задействован — вызывающий обязан сам показать «нужен интернет».
 *
 * `save` возвращает id сета при успехе и `null` при ошибке (текст — в `error`),
 * чтобы вызывающий не дублировал try/catch вокруг каждой мутации.
 */
export function useSaveSetlist() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (payload: CreateSetlistPayload): Promise<string | null> => {
    setSubmitting(true);
    setError(null);
    console.debug(`[useSaveSetlist] create title=${payload.title} songs=${payload.songIds.length}`);
    try {
      const { id } = await setlistsApi.create(payload);
      await invalidateCache(id);
      setSubmitting(false);
      return id;
    } catch (err) {
      console.error('[useSaveSetlist] create failed', err);
      setError(err instanceof Error ? err.message : 'Не удалось сохранить сет. Попробуйте ещё раз.');
      setSubmitting(false);
      return null;
    }
  }, []);

  const update = useCallback(async (id: string, payload: UpdateSetlistPayload): Promise<string | null> => {
    setSubmitting(true);
    setError(null);
    console.debug(`[useSaveSetlist] update ${id}`, payload);
    try {
      await setlistsApi.update(id, payload);
      await invalidateCache(id);
      setSubmitting(false);
      return id;
    } catch (err) {
      console.error('[useSaveSetlist] update failed', err);
      setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения. Попробуйте ещё раз.');
      setSubmitting(false);
      return null;
    }
  }, []);

  const resetError = useCallback(() => setError(null), []);

  return { create, update, submitting, error, resetError };
}
