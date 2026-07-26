import { DEFAULT_NETWORK_TIMEOUT_MS } from '@/shared/offline/networkTimeout';
import { readThrough } from '@/shared/offline/readThrough';
import { setlistsApi } from '@/shared/services/api/endpoints';
import type { Setlist, SetlistSummary } from '../types';

/**
 * Ключи apiCache сетлистов — единственный источник, импортируемый и читателем
 * (`useSetlists`/`useSetlist`), и писателем (`downloadManager`). Расхождение строк
 * уже ломало офлайн (см. patches/2026-07-10-16.46) — не дублировать эти строки.
 */
export const SETLISTS_LIST_CACHE_KEY = 'setlists:list';
export function setlistCacheKey(id: string): string {
  return `setlists:item:${id}`;
}

export async function readSetlistsThrough(
  timeoutMs: number = DEFAULT_NETWORK_TIMEOUT_MS
): Promise<SetlistSummary[]> {
  const res = await readThrough(SETLISTS_LIST_CACHE_KEY, () => setlistsApi.getSetlists(), timeoutMs);
  return res.setlists;
}

export async function readSetlistThrough(id: string, timeoutMs: number = DEFAULT_NETWORK_TIMEOUT_MS): Promise<Setlist> {
  const res = await readThrough(setlistCacheKey(id), () => setlistsApi.getSetlist(id), timeoutMs);
  return res.setlist;
}
