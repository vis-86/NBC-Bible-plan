'use client';

import { useRouter } from 'next/navigation';
import { useSetlists } from '../hooks/useSetlists';
import { partitionSetlists } from '../lib/archive';
import { formatSetlistDate } from '../lib/formatSetlistDate';

function pluralizeSongs(n: number): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'песен';
  const mod10 = abs % 10;
  if (mod10 === 1) return 'песня';
  if (mod10 >= 2 && mod10 <= 4) return 'песни';
  return 'песен';
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Опциональный блок на дашборде: горизонтальная лента предстоящих/без-даты сетов.
 * Пустое состояние — блок не рендерится вовсе (не должен обрастать дашборд пустыми
 * секциями); скелетон при загрузке тоже не показываем (опциональный блок не должен
 * дёргать layout). Ошибка загрузки — тихо ничего, но с `console.warn`.
 */
export const SetlistDashboardStrip: React.FC = () => {
  const router = useRouter();
  const { setlists, loading, error } = useSetlists();

  if (error) {
    console.warn('[SetlistDashboardStrip] failed to load setlists', error);
    return null;
  }
  if (loading) return null;

  const { upcoming, undated } = partitionSetlists(setlists, todayISO());
  const items = [...upcoming, ...undated];
  if (items.length === 0) return null;

  return (
    <div
      data-setlist-strip
      className="flex gap-3 overflow-x-auto px-4 pb-2"
      style={{ scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain' }}
    >
      {items.map((setlist) => (
        <button
          key={setlist.id}
          type="button"
          data-setlist-strip-card
          onClick={() => router.push(`/dashboard/setlist?id=${encodeURIComponent(setlist.id)}`)}
          className="flex w-[72%] shrink-0 flex-col gap-0.5 rounded-app-md border border-app-border bg-app-surface px-4 py-3 text-left shadow-app-sm transition-transform active:scale-[0.98]"
          style={{ scrollSnapAlign: 'start' }}
        >
          <p className="text-xs font-medium text-app-text-muted">{formatSetlistDate(setlist.date)}</p>
          <h3 className="truncate font-semibold text-app-text">{setlist.title}</h3>
          <p className="text-sm text-app-text-secondary">
            {setlist.itemCount} {pluralizeSongs(setlist.itemCount)}
          </p>
        </button>
      ))}
    </div>
  );
};

export default SetlistDashboardStrip;
