'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  downloadBibleTranslation,
  downloadSongs,
  downloadPlan,
  clearAllOfflineData,
  getManifest,
  type ClearOfflineDataResult,
} from '@/shared/offline/downloadManager';
import { getPendingOutbox } from '@/shared/offline/outbox';
import type { ManifestRecord } from '@/shared/offline/db';
import type { BibleTranslationId } from '@/lib/bible-translations';

export type OfflineDownloadCategory = 'bible' | 'songs' | 'plan';

interface CategoryState {
  loading: boolean;
  error: string | null;
  /** 0..1 — известный прогресс; null — неизвестен/не отслеживается для категории. */
  progress: number | null;
}

const initialCategoryState: Record<OfflineDownloadCategory, CategoryState> = {
  bible: { loading: false, error: null, progress: null },
  songs: { loading: false, error: null, progress: null },
  plan: { loading: false, error: null, progress: null },
};

/**
 * Состояние и действия для секции «Оффлайн-данные» настроек (Task 30,
 * .ai-factory/plans/feature-offline-pwa.md) — тонкая обёртка над downloadManager/outbox.
 */
export function useOfflineData() {
  const [manifest, setManifest] = useState<ManifestRecord[]>([]);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [categoryState, setCategoryState] = useState(initialCategoryState);

  const refresh = useCallback(async () => {
    const [m, pending] = await Promise.all([getManifest(), getPendingOutbox()]);
    setManifest(m);
    setPendingOutboxCount(pending.length);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patchCategory = useCallback((category: OfflineDownloadCategory, patch: Partial<CategoryState>) => {
    setCategoryState((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }));
  }, []);

  const downloadTranslation = useCallback(
    async (translationId: BibleTranslationId) => {
      patchCategory('bible', { loading: true, error: null, progress: 0 });
      try {
        await downloadBibleTranslation(translationId, (loaded, total) => {
          patchCategory('bible', { progress: total ? loaded / total : null });
        });
        await refresh();
      } catch (err) {
        console.error('[useOfflineData] downloadTranslation failed', err);
        patchCategory('bible', { error: err instanceof Error ? err.message : 'Не удалось скачать Писание' });
      } finally {
        patchCategory('bible', { loading: false, progress: null });
      }
    },
    [patchCategory, refresh]
  );

  const downloadSongsAction = useCallback(async () => {
    patchCategory('songs', { loading: true, error: null, progress: 0 });
    try {
      await downloadSongs((done, total) => {
        patchCategory('songs', { progress: total ? done / total : null });
      });
      await refresh();
    } catch (err) {
      console.error('[useOfflineData] downloadSongs failed', err);
      patchCategory('songs', { error: err instanceof Error ? err.message : 'Не удалось скачать песни' });
    } finally {
      patchCategory('songs', { loading: false, progress: null });
    }
  }, [patchCategory, refresh]);

  const downloadPlanAction = useCallback(async () => {
    patchCategory('plan', { loading: true, error: null });
    try {
      await downloadPlan();
      await refresh();
    } catch (err) {
      console.error('[useOfflineData] downloadPlan failed', err);
      patchCategory('plan', { error: err instanceof Error ? err.message : 'Не удалось скачать план' });
    } finally {
      patchCategory('plan', { loading: false });
    }
  }, [patchCategory, refresh]);

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
    categoryState,
    downloadTranslation,
    downloadSongsAction,
    downloadPlanAction,
    clear,
    refresh,
  };
}
