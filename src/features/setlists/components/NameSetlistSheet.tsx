'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { useIsOnline } from '@/shared/hooks/useIsOnline';
import { setlistsApi } from '@/shared/services/api/endpoints';
import { getDB } from '@/shared/offline/db';
import { setlistCacheKey, SETLISTS_LIST_CACHE_KEY } from '../lib/offlineSetlists';

interface NameSetlistSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialTitle: string;
  initialDate: string | null;
  songIds: number[];
  /** Присутствует ⇒ режим редактирования (PATCH), иначе — создание (POST). */
  editingId?: string | null;
  onSuccess: (id: string) => void;
}

async function invalidateCache(id?: string | null): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('apiCache', SETLISTS_LIST_CACHE_KEY);
    if (id) await db.delete('apiCache', setlistCacheKey(id));
  } catch (err) {
    console.debug('[NameSetlistSheet] cache invalidation failed', err);
  }
}

/** Именование + сохранение сета: BottomSheet с полем названия (обязательно) и опциональной датой. */
export const NameSetlistSheet: React.FC<NameSetlistSheetProps> = ({
  isOpen,
  onClose,
  initialTitle,
  initialDate,
  songIds,
  editingId,
  onSuccess,
}) => {
  const isOnline = useIsOnline();
  const [title, setTitle] = useState(initialTitle);
  const [date, setDate] = useState<string>(initialDate ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Индирекция (не прямой setState(...) в теле эффекта) — иначе react-hooks/set-state-in-effect.
    const syncFromProps = () => {
      setTitle(initialTitle);
      setDate(initialDate ?? '');
      setError(null);
    };
    if (isOpen) syncFromProps();
  }, [isOpen, initialTitle, initialDate]);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && trimmedTitle.length <= 100 && isOnline && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    console.debug(`[NameSetlistSheet] submit title=${trimmedTitle} songs=${songIds.length} date=${date || 'null'}`);
    try {
      const payload = { title: trimmedTitle, date: date || null, songIds };
      const id = editingId ? editingId : (await setlistsApi.create(payload)).id;
      if (editingId) await setlistsApi.update(editingId, payload);
      await invalidateCache(id);
      onSuccess(id);
    } catch (err) {
      console.error('[NameSetlistSheet] submit failed', err);
      setError(err instanceof Error ? err.message : 'Не удалось сохранить сет. Попробуйте ещё раз.');
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Название сета">
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="setlist-title-input" className="mb-1.5 block text-sm font-medium text-app-text-secondary">
            Название сета
          </label>
          <input
            id="setlist-title-input"
            data-setlist-builder-title-input
            type="text"
            autoFocus
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например, Воскресное утро"
            className="w-full rounded-app-md border border-app-border bg-app-surface px-3 py-2.5 text-app-text outline-none transition-colors focus:border-app-primary"
          />
        </div>

        <div>
          <label htmlFor="setlist-date-input" className="mb-1.5 block text-sm font-medium text-app-text-secondary">
            Дата (необязательно)
          </label>
          <input
            id="setlist-date-input"
            data-setlist-builder-date-input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-app-md border border-app-border bg-app-surface px-3 py-2.5 text-app-text outline-none transition-colors focus:border-app-primary"
          />
        </div>

        {!isOnline && (
          <p role="alert" data-setlist-builder-offline-warning className="text-sm text-app-missed-text">
            Нужен интернет, чтобы сохранить сет.
          </p>
        )}

        {error && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-app-missed-text">
              {error}
            </p>
            <button
              type="button"
              data-setlist-builder-retry
              onClick={handleSubmit}
              className="w-full rounded-app-md border-2 border-app-primary px-4 py-2.5 text-sm font-medium text-app-primary"
            >
              Повторить
            </button>
          </div>
        )}

        <button
          type="button"
          data-setlist-builder-submit
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full rounded-app-md bg-app-primary px-4 py-2.5 text-sm font-semibold text-app-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </BottomSheet>
  );
};

export default NameSetlistSheet;
