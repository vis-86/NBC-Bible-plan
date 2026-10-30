'use client';

import { useCallback, useState } from 'react';
import { useSongs } from '@/features/songs/hooks/useSongs';
import { SetlistManageSheet } from './SetlistManageSheet';
import { summaryToSetlistItems } from '../lib/offlineSetlists';
import type { SetlistItem, SetlistSummary, SetlistSummaryItem } from '../types';

interface SetlistManageHostProps {
  /** Сет, выбранный на карточке списка. Хост монтируется ТОЛЬКО под него. */
  setlist: SetlistSummary;
  initialAction: 'edit' | 'delete';
  canManageSetlists: boolean;
  onClose: () => void;
  /** Новый состав сета — список обновляет свою карточку локально. */
  onItemsChange: (setlistId: string, items: SetlistSummaryItem[]) => void;
  onDeleted: (setlistId: string) => void;
}

function toSummaryItems(items: SetlistItem[]): SetlistSummaryItem[] {
  return items.map((item) => ({ songId: item.songId, title: item.title, songKey: item.songKey }));
}

/**
 * Обёртка вокруг `SetlistManageSheet` для списка сетов. Существует ради ленивой
 * загрузки каталога песен: `useSongs()` живёт здесь, а хост монтируется только когда
 * пользователь выбрал сет для правки. Держать `useSongs()` на самой странице означало бы
 * тянуть весь каталог при каждом заходе на экран, которому песни не нужны.
 */
export const SetlistManageHost: React.FC<SetlistManageHostProps> = ({
  setlist,
  initialAction,
  canManageSetlists,
  onClose,
  onItemsChange,
  onDeleted,
}) => {
  const { songs } = useSongs();
  const [items, setItems] = useState<SetlistItem[]>(() => summaryToSetlistItems(setlist.items));

  const handleItemsChange = useCallback(
    (next: SetlistItem[]) => {
      setItems(next);
      onItemsChange(setlist.id, toSummaryItems(next));
    },
    [onItemsChange, setlist.id]
  );

  console.debug(`[SetlistManageHost] setlist=${setlist.id} action=${initialAction} songs=${songs.length}`);

  return (
    <SetlistManageSheet
      isOpen
      onClose={onClose}
      setlistId={setlist.id}
      title={setlist.title}
      items={items}
      onItemsChange={handleItemsChange}
      songs={songs}
      canManageSetlists={canManageSetlists}
      onDeleted={() => onDeleted(setlist.id)}
      initialAction={initialAction}
    />
  );
};

export default SetlistManageHost;
