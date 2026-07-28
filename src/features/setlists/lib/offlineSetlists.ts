import { isDefinitelyOffline, reportNetworkSuccess } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, raceWithTimeout } from '@/shared/offline/networkTimeout';
import { persistApiCache, readThrough } from '@/shared/offline/readThrough';
import { setlistsApi } from '@/shared/services/api/endpoints';
import type { Setlist, SetlistSummary } from '../types';

/**
 * Ключи apiCache сетлистов — единственный источник, импортируемый и читателем
 * (`useSetlists`/`useSetlist`), и писателем (`downloadManager`). Расхождение строк
 * уже ломало офлайн (см. patches/2026-07-10-16.46) — не дублировать эти строки.
 */
/**
 * `:v2` — форма ответа списка изменилась (добавлен `items` с составом сета). Записи,
 * закэшированные предыдущей версией приложения, не содержат `items` и уронили бы карточку;
 * смена ключа выводит их из игры разом. Меняешь форму ответа — поднимай версию.
 */
export const SETLISTS_LIST_CACHE_KEY = 'setlists:list:v2';
export function setlistCacheKey(id: string): string {
  return `setlists:item:${id}`;
}

export async function readSetlistsThrough(
  timeoutMs: number = DEFAULT_NETWORK_TIMEOUT_MS
): Promise<SetlistSummary[]> {
  const res = await readThrough(SETLISTS_LIST_CACHE_KEY, () => setlistsApi.getSetlists(), timeoutMs);
  return res.setlists;
}

/**
 * Таймаут ручного обновления. Больше сетевого дефолта (6s) осознанно: жест инициирован
 * пользователем, он смотрит на спиннер и готов подождать дольше фонового чтения.
 */
export const PULL_REFRESH_TIMEOUT_MS = 10_000;

/**
 * Принудительное сетевое чтение списка сетов (pull-to-refresh).
 *
 * Почему НЕ `readSetlistsThrough`: тот идёт через `raceNetwork`, и при разомкнутой цепи
 * (недавний таймаут) мгновенно отдаёт ТОТ ЖЕ кеш — пользователь тянет список, спиннер
 * крутится, ничего не меняется. Ручное обновление — явный интент, оно и есть пробный
 * запрос: обходим circuit breaker через generic `raceWithTimeout`.
 *
 * Фолбэка на IDB здесь нет намеренно: данные уже на экране, при неудаче показываем
 * ошибку и оставляем список как есть.
 */
export async function refreshSetlistsFromNetwork(
  timeoutMs: number = PULL_REFRESH_TIMEOUT_MS
): Promise<SetlistSummary[]> {
  console.debug('[offlineSetlists] manual refresh: start');

  // Заведомый офлайн — ждать нечего by construction, fail fast без похода в сеть.
  if (isDefinitelyOffline()) {
    console.warn('[offlineSetlists] manual refresh: offline, сеть не трогаем');
    throw new Error('Нет сети. Список не обновлён');
  }

  try {
    const res = await raceWithTimeout(setlistsApi.getSetlists(), timeoutMs);
    // Форма записи обязана совпадать с той, что пишет readThrough (полный ответ,
    // не массив) — иначе следующий офлайн-старт уронит карточку сета.
    await persistApiCache(SETLISTS_LIST_CACHE_KEY, res);
    reportNetworkSuccess();
    console.debug(`[offlineSetlists] manual refresh: ok, ${res.setlists.length} setlist(s)`);
    return res.setlists;
  } catch (err) {
    console.warn('[offlineSetlists] manual refresh failed', err);
    throw err;
  }
}

export async function readSetlistThrough(id: string, timeoutMs: number = DEFAULT_NETWORK_TIMEOUT_MS): Promise<Setlist> {
  const res = await readThrough(setlistCacheKey(id), () => setlistsApi.getSetlist(id), timeoutMs);
  return res.setlist;
}
