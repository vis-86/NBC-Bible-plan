import { isDefinitelyOffline } from '@/shared/offline/networkHealth';
import { partitionSetlists } from './archive';
import { readSetlistThroughSWR } from './offlineSetlists';
import { warmSetlistSongs } from './warmSetlistSongs';
import type { SetlistSummary } from '../types';

/**
 * Подписи уже прогретых в этой сессии сетов (`id` + состав). Список читается при каждом
 * заходе на экран и после каждой ревалидации — без дедупа каждый заход гонял бы деталь
 * и песни всех сетов заново. Сменился состав — подпись другая, сет греется снова.
 */
const warmed = new Set<string>();

function signature(setlist: SetlistSummary): string {
  return `${setlist.id}:${setlist.items.map((item) => item.songId).join(',')}`;
}

/** Сброс дедупа — только для тестов. */
export function resetWarmedSetlists(): void {
  warmed.clear();
}

/**
 * «Получили сет — он офлайн»: на каждом списке, пришедшем с сервера, греем деталь
 * каждого сета и песни ближайших/без даты. Раньше деталь попадала в IDB только при
 * открытии сета или на дельта-синке следующего запуска: сет, увиденный в списке дома,
 * в зале без сети открывал песню вне сета.
 *
 * Греем ТЕМИ ЖЕ вызовами, которыми читают экраны (`readSetlistThroughSWR`,
 * `warmSetlistSongs` → `readSongThroughSWR`) — писатель и читатель одним путём.
 * Песни архивных сетов не греем: на служение по ним не идут, а каталог песен и так
 * скачан базовой загрузкой; их деталь — греем (дёшево, один запрос на сет).
 *
 * Best-effort: ошибки логируются и не пробрасываются, вызывающий не ждёт результата.
 */
export async function warmSetlistsOffline(list: SetlistSummary[], todayISO: string): Promise<void> {
  if (isDefinitelyOffline()) {
    console.debug('[warmSetlistsOffline] офлайн — прогрев пропущен', { total: list.length });
    return;
  }

  const pending = list.filter((setlist) => !warmed.has(signature(setlist)));
  if (pending.length === 0) return;
  const { past } = partitionSetlists(pending, todayISO);
  const archived = new Set(past.map((setlist) => setlist.id));
  console.info('[warmSetlistsOffline] старт', { total: pending.length, archived: archived.size });

  for (const summary of pending) {
    const key = signature(summary);
    warmed.add(key);
    try {
      const { setlist } = await readSetlistThroughSWR(summary.id);
      if (!archived.has(summary.id)) await warmSetlistSongs(setlist.id, setlist.items);
    } catch (err) {
      // Следующий список попробует снова — подпись не считается прогретой.
      warmed.delete(key);
      console.debug('[warmSetlistsOffline] сет не прогрет', { id: summary.id, err });
    }
  }
}
