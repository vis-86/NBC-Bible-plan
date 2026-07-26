'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { formatSetlistDate } from '../lib/formatSetlistDate';
import { SetlistReorderList, type ReorderableSong } from './SetlistReorderList';
import { SetlistManageSheet } from './SetlistManageSheet';
import { setlistSongHref } from './SetlistCard';
import type { SongSummary } from '@/features/songs/types';
import type { Setlist, SetlistItem } from '../types';

interface SetlistViewProps {
  setlist: Setlist;
  canManageSetlists: boolean;
  /** Каталог песен для шита добавления. Пустой массив, пока грузится. */
  songs: SongSummary[];
}

/**
 * Страница сета — read-only витрина состава. Основной путь работы с сетом идёт через
 * просмотр песни (тап по сету в списке), а эта страница остаётся для пустого сета,
 * экрана после создания и прямой ссылки. Вся правка — в `SetlistManageSheet`.
 */
export const SetlistView: React.FC<SetlistViewProps> = ({ setlist, canManageSetlists, songs }) => {
  const router = useRouter();
  const [isManageOpen, setIsManageOpen] = useState(false);

  /** Локальная копия состава: правки из шита применяются оптимистично, до перезагрузки детали. */
  const [items, setItems] = useState<SetlistItem[]>(setlist.items);

  useEffect(() => {
    // Индирекция вместо прямого setState в теле эффекта (react-hooks/set-state-in-effect).
    const syncFromServer = () => setItems(setlist.items);
    syncFromServer();
  }, [setlist.items]);

  const dateLabel = formatSetlistDate(setlist.date);

  console.debug(`[SetlistView] id=${setlist.id} items=${items.length} canManage=${canManageSetlists}`);

  const reorderable: ReorderableSong[] = useMemo(
    () => items.map((item) => ({ id: item.songId, title: item.title, subtitle: item.subtitle, songKey: item.songKey })),
    [items]
  );

  const openSong = (songId: number) => router.push(setlistSongHref(setlist.id, songId));

  return (
    <div data-setlist-view className="flex flex-col gap-4 px-4 pt-3 pb-8">
      <div>
        {dateLabel && (
          <p data-setlist-view-date className="text-sm font-medium text-app-text-muted">
            {dateLabel}
          </p>
        )}
        <h1 data-setlist-view-title className="text-xl font-bold text-app-text">
          {setlist.title}
        </h1>
      </div>

      <SetlistReorderList items={reorderable} editable={false} onOpen={openSong} />

      {items.length === 0 && <p className="py-8 text-center text-app-text-muted">В сете пока нет песен</p>}

      {canManageSetlists && (
        <button
          type="button"
          data-setlist-view-manage
          onClick={() => setIsManageOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-app-md bg-app-primary px-4 py-2.5 text-sm font-semibold text-app-text-inverse transition-transform active:scale-[0.98]"
        >
          <Pencil size={16} aria-hidden />
          Изменить сет
        </button>
      )}

      <SetlistManageSheet
        isOpen={isManageOpen}
        onClose={() => setIsManageOpen(false)}
        setlistId={setlist.id}
        title={setlist.title}
        items={items}
        onItemsChange={setItems}
        songs={songs}
        canManageSetlists={canManageSetlists}
        onOpenSong={openSong}
        onDeleted={() => router.replace('/dashboard/setlists')}
      />
    </div>
  );
};

export default SetlistView;
