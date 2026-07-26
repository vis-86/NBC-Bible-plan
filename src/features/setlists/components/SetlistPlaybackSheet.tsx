'use client';

import { Check } from 'lucide-react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import type { Setlist } from '../types';

interface SetlistPlaybackSheetProps {
  isOpen: boolean;
  onClose: () => void;
  items: Setlist['items'];
  currentSongId: number;
  onSelect: (songId: number) => void;
}

/** Шторка списка сета в режиме просмотра песни: номер, название, текущая подсвечена. */
export const SetlistPlaybackSheet: React.FC<SetlistPlaybackSheetProps> = ({
  isOpen,
  onClose,
  items,
  currentSongId,
  onSelect,
}) => {
  if (isOpen) console.debug(`[SetlistPlaybackSheet] open, index=${items.findIndex((i) => i.songId === currentSongId) + 1}/${items.length}`);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Песни сета">
      <ul data-setlist-playback-sheet className="flex flex-col gap-1">
        {items.map((item, i) => {
          const isCurrent = item.songId === currentSongId;
          return (
            <li key={item.id}>
              <button
                type="button"
                data-setlist-playback-sheet-item
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => onSelect(item.songId)}
                className="flex w-full items-center gap-3 rounded-app-md px-3 py-2.5 text-left transition-colors data-[current=true]:bg-app-primary-muted"
                data-current={isCurrent}
              >
                <span className="w-5 shrink-0 text-sm text-app-text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-app-text">{item.title}</span>
                {isCurrent && <Check size={16} className="shrink-0 text-app-primary" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
};

export default SetlistPlaybackSheet;
