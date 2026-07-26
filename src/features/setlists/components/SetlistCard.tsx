'use client';

import { useRouter } from 'next/navigation';
import { formatSetlistDate } from '../lib/formatSetlistDate';
import type { SetlistSummary } from '../types';

interface SetlistCardProps {
  setlist: SetlistSummary;
}

/** Путь просмотра песни в режиме сета — один и тот же для тапа по карточке и по строке. */
export function setlistSongHref(setlistId: string, songId: number): string {
  return `/dashboard/song?id=${encodeURIComponent(String(songId))}&setlistId=${encodeURIComponent(setlistId)}`;
}

/**
 * Карточка сета в списке: дата (если задана), название и весь состав сразу — музыкант
 * видит программу, не открывая сет. Тап по шапке ведёт на первую песню в режиме сета,
 * тап по строке — на эту песню. Пустой сет открывается страницей сета (открывать нечего).
 */
export const SetlistCard: React.FC<SetlistCardProps> = ({ setlist }) => {
  const router = useRouter();
  const dateLabel = formatSetlistDate(setlist.date);
  const items = setlist.items;

  const openSetlist = () => {
    if (items.length === 0) {
      router.push(`/dashboard/setlist?id=${encodeURIComponent(setlist.id)}`);
      return;
    }
    router.push(setlistSongHref(setlist.id, items[0].songId));
  };

  return (
    <div
      data-setlist-card
      data-setlist-card-item={setlist.id}
      className="overflow-hidden rounded-app-md border border-app-border bg-app-surface shadow-app-sm"
    >
      <button
        type="button"
        data-setlist-card-header
        onClick={openSetlist}
        className="flex w-full flex-col gap-0.5 px-4 pt-3 pb-2 text-left transition-transform active:scale-[0.99]"
      >
        {dateLabel && (
          <p data-setlist-card-date className="text-xs font-medium text-app-text-muted">
            {dateLabel}
          </p>
        )}
        <h3 data-setlist-card-title className="truncate text-lg font-bold text-app-text">
          {setlist.title}
        </h3>
      </button>

      {items.length === 0 ? (
        <p data-setlist-card-empty className="px-4 pb-3 text-sm text-app-text-muted">
          Песен пока нет
        </p>
      ) : (
        <ul data-setlist-card-songs className="flex flex-col pb-1">
          {items.map((item, i) => (
            <li key={`${item.songId}-${i}`}>
              <button
                type="button"
                data-setlist-card-song
                onClick={() => router.push(setlistSongHref(setlist.id, item.songId))}
                className="flex w-full items-center gap-2 px-4 py-1.5 text-left transition-colors active:bg-app-surface-muted"
              >
                <span className="shrink-0 text-sm tabular-nums text-app-text-muted">{i + 1})</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-app-text-muted">#{item.songId}</span>
                <span className="min-w-0 flex-1 truncate text-app-text">{item.title}</span>
                {item.songKey && (
                  <span className="shrink-0 rounded-full bg-app-primary-muted px-2 py-0.5 text-xs font-semibold text-app-primary">
                    {item.songKey}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SetlistCard;
