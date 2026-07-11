'use client';

import { useRouter } from 'next/navigation';
import type { SongSummary } from '../types';

interface SongCardProps {
  song: SongSummary;
}

/** Карточка песни в списке: заголовок + подзаголовок + чип тональности. */
export const SongCard: React.FC<SongCardProps> = ({ song }) => {
  const router = useRouter();

  return (
    <button
      type="button"
      data-song-card
      data-song-card-item={song.id}
      onClick={() => router.push(`/dashboard/song?id=${encodeURIComponent(song.id)}`)}
      className="flex w-full items-center gap-3 rounded-app-md border border-app-border bg-app-surface px-4 py-3 text-left shadow-app-sm transition-transform active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <h3 data-song-card-title className="truncate font-semibold text-app-text">
          {song.title}
        </h3>
        {song.subtitle && (
          <p data-song-card-subtitle className="truncate text-sm text-app-text-secondary">
            {song.subtitle}
          </p>
        )}
      </div>
      {song.key && (
        <span
          data-song-card-key
          className="shrink-0 rounded-full bg-app-primary-muted px-2.5 py-1 text-xs font-semibold text-app-primary"
        >
          {song.key}
        </span>
      )}
    </button>
  );
};

export default SongCard;
