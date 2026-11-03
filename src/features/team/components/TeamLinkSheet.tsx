'use client';

import { useState } from 'react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Button } from '@/shared/components/ui/Button';

export interface TeamLinkSheetProps {
  /** `null` — шторка закрыта. */
  url: string | null;
  title: string;
  onClose: () => void;
}

/** Выданная одноразовая ссылка: скопировать или передать через системное «Поделиться». */
export function TeamLinkSheet({ url, title, onClose }: TeamLinkSheetProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError(null);
    } catch (err) {
      console.debug('[TeamLinkSheet] copy failed', err);
      setError('Не удалось скопировать — выделите ссылку вручную');
    }
  };

  const share = async () => {
    if (!url) return;
    try {
      await navigator.share({ url });
    } catch (err) {
      // AbortError — пользователь закрыл системное меню, это не ошибка.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.debug('[TeamLinkSheet] share failed', err);
      setError('Не удалось поделиться ссылкой');
    }
  };

  return (
    <BottomSheet isOpen={url !== null} onClose={onClose} title={title}>
      <div data-team-link-sheet className="space-y-3 px-4 pb-6">
        <input
          readOnly
          data-team-link-url
          value={url ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-app-md border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text"
        />
        <p data-team-link-note className="text-sm text-app-text-muted">
          Ссылка одноразовая, действует 7 дней, передайте лично.
        </p>
        {error && <p className="text-sm text-app-missed-text">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" data-team-link-copy onClick={copy} className="flex-1">
            {copied ? 'Скопировано' : 'Скопировать'}
          </Button>
          {canShare && (
            <Button type="button" variant="secondary" data-team-link-share onClick={share} className="flex-1">
              Поделиться
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
