'use client';

import { useEffect, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { buildSongShareUrl, shareSong } from '../lib/songShare';

export interface SongShareButtonProps {
  songId: string;
  title: string;
}

const COPIED_FEEDBACK_MS = 2000;

/** Кнопка шапки песни: системный шит «Поделиться», на десктопе — ссылка в буфер. */
export function SongShareButton({ songId, title }: SongShareButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleClick = async () => {
    const result = await shareSong({ id: songId, title });
    if (result === 'copied') setCopied(true);
    // Ни шита, ни буфера (нет разрешения, не-https) — отдаём ссылку на ручное копирование.
    if (result === 'failed') window.prompt('Скопируйте ссылку на песню', buildSongShareUrl(songId));
  };

  return (
    <button
      type="button"
      data-song-share-button
      aria-label={copied ? 'Ссылка скопирована' : 'Поделиться песней'}
      onClick={() => void handleClick()}
      className="rounded-app-sm p-2 text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
    >
      {copied ? <Check size={20} className="text-app-success" /> : <Share2 size={20} />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Ссылка скопирована' : ''}
      </span>
    </button>
  );
}
