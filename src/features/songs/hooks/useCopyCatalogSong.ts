'use client';

import { useCallback, useState } from 'react';
import { ApiClientError } from '@/shared/services/api/client';
import { catalogApi } from '@/shared/services/api/endpoints';
import { raceWithTimeout } from '@/shared/offline/networkTimeout';
import { refreshAfterWrite } from './useSaveSong';

/** Копирование пишет в Directus — как и сохранение песни, дольше обычного чтения. */
const COPY_TIMEOUT_MS = 20_000;

export type CopyResult =
  | { status: 'copied'; id: string }
  /** Копия уже была — `id` нашей песни. */
  | { status: 'existing'; id: string }
  | { status: 'gone' }
  | { status: 'error'; message: string };

/**
 * «Скопировать к себе» из каталога. После 201 песня и список кладутся в IDB тем же
 * вызовом, что после записи в редакторе (`refreshAfterWrite`).
 */
export function useCopyCatalogSong() {
  const [submitting, setSubmitting] = useState(false);

  const copy = useCallback(async (id: string): Promise<CopyResult> => {
    setSubmitting(true);
    try {
      const res = await raceWithTimeout(catalogApi.copy(id), COPY_TIMEOUT_MS);
      // Копия уже могла появиться (в т.ч. повтор после таймаута) — её тоже кладём в IDB и список.
      await refreshAfterWrite(res.id);
      return { status: res.alreadyCopied ? 'existing' : 'copied', id: res.id };
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) return { status: 'gone' };
      console.error(`[useCopyCatalogSong] copy ${id} failed`, err);
      if (err instanceof ApiClientError && err.status === 403) {
        return { status: 'error', message: 'Недостаточно прав для копирования песен.' };
      }
      return { status: 'error', message: 'Не удалось скопировать. Проверьте интернет и попробуйте ещё раз.' };
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { copy, submitting };
}
