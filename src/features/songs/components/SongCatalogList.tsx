'use client';

import { useRouter } from 'next/navigation';
import type { CatalogSong } from '../types';

interface SongCatalogListProps {
  songs: CatalogSong[];
}

/** Строка каталога: свою копию открываем как обычную песню, чужую — в предпросмотр. */
export function SongCatalogList({ songs }: SongCatalogListProps) {
  const router = useRouter();

  if (songs.length === 0) {
    return (
      <div data-song-catalog-empty className="py-16 text-center text-app-text-muted">
        Ничего не найдено
      </div>
    );
  }

  return (
    <ul data-song-catalog-list className="flex flex-col gap-2">
      {songs.map((song) => (
        <li key={song.id}>
          <button
            type="button"
            data-song-catalog-item={song.id}
            onClick={() =>
              router.push(
                song.copiedAs
                  ? `/dashboard/song?id=${encodeURIComponent(song.copiedAs)}`
                  : `/dashboard/catalog?id=${encodeURIComponent(song.id)}`
              )
            }
            className="flex w-full items-center gap-3 rounded-app-md border border-app-border bg-app-surface px-4 py-3 text-left shadow-app-sm transition-transform active:scale-[0.98]"
          >
            <div className="min-w-0 flex-1">
              <h3 data-song-catalog-title className="truncate font-semibold text-app-text">
                {song.title}
              </h3>
              {song.subtitle && <p className="truncate text-sm text-app-text-secondary">{song.subtitle}</p>}
              <p data-song-catalog-team className="truncate text-xs text-app-text-muted">
                {song.teamName}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {song.key && (
                <span className="rounded-full bg-app-primary-muted px-2.5 py-1 text-xs font-semibold text-app-primary">
                  {song.key}
                </span>
              )}
              {song.copiedAs && (
                <span
                  data-song-catalog-copied
                  className="rounded-full bg-app-success px-2 py-0.5 text-xs font-medium text-app-success-text"
                >
                  Уже у вас
                </span>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
