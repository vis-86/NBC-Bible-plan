'use client';

import { useRouter } from 'next/navigation';
import { formatSetlistDate } from '../lib/formatSetlistDate';
import type { SetlistSummary } from '../types';

interface SetlistCardProps {
  setlist: SetlistSummary;
}

function pluralizeSongs(n: number): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'песен';
  const mod10 = abs % 10;
  if (mod10 === 1) return 'песня';
  if (mod10 >= 2 && mod10 <= 4) return 'песни';
  return 'песен';
}

/** Карточка сета в списке/архиве: дата + название + число песен. */
export const SetlistCard: React.FC<SetlistCardProps> = ({ setlist }) => {
  const router = useRouter();

  return (
    <button
      type="button"
      data-setlist-card
      data-setlist-card-item={setlist.id}
      onClick={() => router.push(`/dashboard/setlist?id=${encodeURIComponent(setlist.id)}`)}
      className="flex w-full flex-col gap-0.5 rounded-app-md border border-app-border bg-app-surface px-4 py-3 text-left shadow-app-sm transition-transform active:scale-[0.98]"
    >
      <p data-setlist-card-date className="text-xs font-medium text-app-text-muted">
        {formatSetlistDate(setlist.date)}
      </p>
      <h3 data-setlist-card-title className="truncate font-semibold text-app-text">
        {setlist.title}
      </h3>
      <p data-setlist-card-count className="text-sm text-app-text-secondary">
        {setlist.itemCount} {pluralizeSongs(setlist.itemCount)}
      </p>
    </button>
  );
};

export default SetlistCard;
