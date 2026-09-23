'use client';

import { useCallback, useState } from 'react';
import { ApiClientError } from '@/shared/services/api/client';
import { songsApi } from '@/shared/services/api/endpoints';
import { raceWithTimeout, isNetworkTimeout } from '@/shared/offline/networkTimeout';
import { persistCachedSong } from '../lib/offlineSongs';
import { rememberSong } from './useSong';
import { refreshSongsList } from './useSongs';
import type { CreateSongPayload, UpdateSongPayload } from '../types';

/**
 * Запись дольше обычного чтения: Directus пишет, BFF ищет свободный slug. Таймаут всё
 * равно нужен — реальный офлайн вешает запрос, и кнопка крутилась бы вечно.
 */
const WRITE_TIMEOUT_MS = 20_000;
/** Обновление кешей после записи — не повод держать человека на экране редактора. */
const REFRESH_TIMEOUT_MS = 6_000;

export function saveErrorMessage(err: unknown): string {
  if (isNetworkTimeout(err)) {
    // Ответа нет, но запись могла дойти: повтор создания дал бы дубль песни.
    return 'Сервер не ответил. Проверьте в списке песен, сохранилось ли, прежде чем повторять.';
  }
  if (err instanceof ApiClientError) {
    if (err.status === 400) return err.message;
    if (err.status === 403) return 'Недостаточно прав для правки песен.';
    if (err.status === 404) return 'Песня не найдена — возможно, её удалили.';
  }
  return 'Не удалось сохранить. Попробуйте ещё раз.';
}

/**
 * Свежая песня и список — в IDB и память сессии. Экраны читают cache-first, и без этого
 * автор ещё до 5 минут видел бы свою песню до правки. Сбой не фатален: запись уже прошла,
 * а дельта-синк следующего запуска всё равно принесёт новую версию.
 */
async function refreshAfterWrite(id: string): Promise<void> {
  const song = raceWithTimeout(songsApi.getSong(id), REFRESH_TIMEOUT_MS).then(async ({ song: fresh }) => {
    await persistCachedSong(fresh);
    rememberSong(fresh);
  });
  const list = raceWithTimeout(refreshSongsList(), REFRESH_TIMEOUT_MS);
  const results = await Promise.allSettled([song, list]);
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`[useSaveSong] refresh ${i === 0 ? 'song' : 'list'} after write failed`, result.reason);
    }
  });
}

/**
 * Сохранение песни — создание (POST) и правка (PUT). Запись online-only (решение 4
 * плана M9): outbox не участвует, «нужен интернет» показывает вызывающий.
 *
 * Возвращает id песни при успехе и `null` при ошибке (текст — в `error`).
 */
export function useSaveSong() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (label: string, write: () => Promise<string>): Promise<string | null> => {
    setSubmitting(true);
    setError(null);
    try {
      const id = await raceWithTimeout(write(), WRITE_TIMEOUT_MS);
      console.debug(`[useSaveSong] ${label} ok, id=${id}`);
      await refreshAfterWrite(id);
      return id;
    } catch (err) {
      console.error(`[useSaveSong] ${label} failed`, err);
      setError(saveErrorMessage(err));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const create = useCallback(
    (payload: CreateSongPayload) => run('create', () => songsApi.create(payload).then(({ id }) => String(id))),
    [run]
  );

  const update = useCallback(
    (id: string, patch: UpdateSongPayload) => run(`update ${id}`, () => songsApi.update(id, patch).then(() => id)),
    [run]
  );

  return { create, update, submitting, error };
}
