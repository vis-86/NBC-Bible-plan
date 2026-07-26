'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  downloadBibleTranslation,
  downloadSongs,
  downloadPlan,
  downloadSetlists,
  clearAllOfflineData,
  getManifest,
  type ClearOfflineDataResult,
} from '@/shared/offline/downloadManager';
import { getPendingOutbox } from '@/shared/offline/outbox';
import type { ManifestRecord } from '@/shared/offline/db';
import { BIBLE_TRANSLATIONS, type BibleTranslationId } from '@/lib/bible-translations';

/** Ключ загрузки: id перевода Писания, либо 'songs' / 'plan' / 'setlists'. */
export type OfflineDownloadKey = BibleTranslationId | 'songs' | 'plan' | 'setlists';

export interface ItemState {
  loading: boolean;
  error: string | null;
  /** 0..1 — известный прогресс; null — неизвестен/не отслеживается. */
  progress: number | null;
}

const EMPTY_ITEM_STATE: ItemState = { loading: false, error: null, progress: null };

/** Прогресс массовой загрузки «скачать всё». */
export interface BulkState {
  loading: boolean;
  done: number;
  total: number;
  failed: number;
}

const INITIAL_BULK: BulkState = { loading: false, done: 0, total: 0, failed: 0 };

/** Переводы, разрешённые к самостоятельному хостингу → их можно качать офлайн. */
const DOWNLOADABLE_TRANSLATION_IDS = Object.values(BIBLE_TRANSLATIONS)
  .filter((t) => t.selfHostedAllowed)
  .map((t) => t.id as BibleTranslationId);

/**
 * Состояние и действия для секции «Оффлайн-данные» настроек (Task 30,
 * .ai-factory/plans/feature-offline-pwa.md) — тонкая обёртка над downloadManager/outbox.
 */
export function useOfflineData() {
  const [manifest, setManifest] = useState<ManifestRecord[]>([]);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  // Состояние загрузки — на КАЖДЫЙ элемент отдельно (ключ = id перевода | 'songs' | 'plan').
  // Раньше все переводы Писания делили одно общее `bible`-состояние, поэтому загрузка
  // одного перевода зажигала индикатор на всех Писаниях.
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [bulk, setBulk] = useState<BulkState>(INITIAL_BULK);

  const refresh = useCallback(async () => {
    const [m, pending] = await Promise.all([getManifest(), getPendingOutbox()]);
    setManifest(m);
    setPendingOutboxCount(pending.length);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patchItem = useCallback((key: OfflineDownloadKey, patch: Partial<ItemState>) => {
    setItemState((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY_ITEM_STATE), ...patch } }));
  }, []);

  const getItemState = useCallback(
    (key: OfflineDownloadKey): ItemState => itemState[key] ?? EMPTY_ITEM_STATE,
    [itemState]
  );

  const downloadTranslation = useCallback(
    async (translationId: BibleTranslationId): Promise<boolean> => {
      patchItem(translationId, { loading: true, error: null, progress: 0 });
      try {
        await downloadBibleTranslation(translationId, (loaded, total) => {
          patchItem(translationId, { progress: total ? loaded / total : null });
        });
        await refresh();
        return true;
      } catch (err) {
        console.error('[useOfflineData] downloadTranslation failed', err);
        patchItem(translationId, { error: err instanceof Error ? err.message : 'Не удалось скачать Писание' });
        return false;
      } finally {
        patchItem(translationId, { loading: false, progress: null });
      }
    },
    [patchItem, refresh]
  );

  const downloadSongsAction = useCallback(async (): Promise<boolean> => {
    patchItem('songs', { loading: true, error: null, progress: 0 });
    try {
      await downloadSongs((done, total) => {
        patchItem('songs', { progress: total ? done / total : null });
      });
      await refresh();
      return true;
    } catch (err) {
      console.error('[useOfflineData] downloadSongs failed', err);
      patchItem('songs', { error: err instanceof Error ? err.message : 'Не удалось скачать песни' });
      return false;
    } finally {
      patchItem('songs', { loading: false, progress: null });
    }
  }, [patchItem, refresh]);

  const downloadPlanAction = useCallback(async (): Promise<boolean> => {
    patchItem('plan', { loading: true, error: null });
    try {
      await downloadPlan();
      await refresh();
      return true;
    } catch (err) {
      console.error('[useOfflineData] downloadPlan failed', err);
      patchItem('plan', { error: err instanceof Error ? err.message : 'Не удалось скачать план' });
      return false;
    } finally {
      patchItem('plan', { loading: false });
    }
  }, [patchItem, refresh]);

  const downloadSetlistsAction = useCallback(async (): Promise<boolean> => {
    patchItem('setlists', { loading: true, error: null });
    try {
      await downloadSetlists();
      await refresh();
      return true;
    } catch (err) {
      console.error('[useOfflineData] downloadSetlists failed', err);
      patchItem('setlists', { error: err instanceof Error ? err.message : 'Не удалось скачать сетлисты' });
      return false;
    } finally {
      patchItem('setlists', { loading: false });
    }
  }, [patchItem, refresh]);

  /**
   * Качает всё за один клик: переводы Писания по очереди (чтобы не долбить сервер),
   * затем песни и план. Ошибка одного элемента не прерывает остальные — считаем,
   * сколько упало, и отдаём в UI через `bulk.failed`.
   */
  const downloadAll = useCallback(async () => {
    const total = DOWNLOADABLE_TRANSLATION_IDS.length + 3; // + песни + план + сетлисты
    setBulk({ loading: true, done: 0, total, failed: 0 });
    let done = 0;
    let failed = 0;

    const step = async (action: Promise<boolean>) => {
      const ok = await action;
      done += 1;
      if (!ok) failed += 1;
      setBulk({ loading: true, done, total, failed });
    };

    for (const id of DOWNLOADABLE_TRANSLATION_IDS) {
      await step(downloadTranslation(id));
    }
    await step(downloadSongsAction());
    await step(downloadPlanAction());
    await step(downloadSetlistsAction());

    setBulk({ loading: false, done, total, failed });
  }, [downloadTranslation, downloadSongsAction, downloadPlanAction, downloadSetlistsAction]);

  const clear = useCallback(
    async (options?: { force?: boolean }): Promise<ClearOfflineDataResult> => {
      const result = await clearAllOfflineData(options);
      await refresh();
      return result;
    },
    [refresh]
  );

  return {
    manifest,
    pendingOutboxCount,
    getItemState,
    bulk,
    downloadableTranslationIds: DOWNLOADABLE_TRANSLATION_IDS,
    downloadTranslation,
    downloadSongsAction,
    downloadPlanAction,
    downloadSetlistsAction,
    downloadAll,
    clear,
    refresh,
  };
}
