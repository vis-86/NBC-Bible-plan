import { isDefinitelyOffline } from '@/shared/offline/networkHealth';
import { readSongThroughSWR } from '@/features/songs/lib/offlineSongs';
import { songsApi } from '@/shared/services/api/endpoints';
import type { SetlistItem } from '../types';

/**
 * Фоновая догрузка всех песен открытого сета в стор `songs`.
 *
 * Греем ТЕМ ЖЕ вызовом, которым читает экран песни (`readSongThroughSWR`) — писатель и
 * читатель обязаны ходить одним путём, иначе прогрев кладёт данные не туда, откуда их
 * достают (см. patches/2026-07-10-16.46). Свежий кеш песни пропускается самим SWR:
 * при попадании в TTL он не идёт в сеть.
 *
 * Импорт `features/songs` из `features/setlists` — продолжение существующего прецедента
 * (`useSetlistPlayback`), новых исключений FSD не вводим.
 */

const DEFAULT_CONCURRENCY = 3;

export interface WarmSetlistSongsResult {
  total: number;
  warmed: number;
  skipped: number;
}

export async function warmSetlistSongs(
  setlistId: string,
  items: SetlistItem[],
  concurrency: number = DEFAULT_CONCURRENCY
): Promise<WarmSetlistSongsResult> {
  const ids = Array.from(new Set(items.map((item) => String(item.songId))));

  // Заведомый офлайн — сеть трогать бессмысленно, запросы просто повиснут.
  if (isDefinitelyOffline()) {
    console.debug('[warmSetlistSongs] офлайн — прогрев пропущен', { setlistId, total: ids.length });
    return { total: ids.length, warmed: 0, skipped: ids.length };
  }

  console.info('[warmSetlistSongs] старт', { setlistId, total: ids.length, concurrency });

  let warmed = 0;
  let skipped = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const { fromCache, revalidating } = await readSongThroughSWR(id, () =>
          songsApi.getSong(id).then((res) => res.song)
        );
        if (fromCache && !revalidating) {
          skipped += 1;
          console.debug('[warmSetlistSongs] песня уже свежая', { id });
        } else {
          warmed += 1;
          console.debug('[warmSetlistSongs] песня прогрета', { id, fromCache });
        }
      } catch (err) {
        // Прогрев best-effort: одна недоступная песня не должна ронять остальные.
        skipped += 1;
        console.debug('[warmSetlistSongs] песня не прогрета', { id, err });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));

  const result = { total: ids.length, warmed, skipped };
  console.info('[warmSetlistSongs] итог', { setlistId, ...result });
  return result;
}
