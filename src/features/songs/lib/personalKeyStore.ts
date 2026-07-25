/**
 * Личная тональность музыканта — ВРЕМЕННОЕ устройство-локальное хранилище.
 *
 * По спеке §7 тональность едет за музыкантом между устройствами (Directus
 * `song_user_state`), но запись пользовательских данных обязана идти через write-ahead
 * outbox, а его обобщение — это M6, которого ещё нет (BFF по песням только GET).
 * До M6 персист локальный, синхронизация пользователю не заявляется.
 *
 * Поэтому API узкий (три функции, никаких утечек формата хранения наружу): подмена
 * localStorage на outbox + `song_user_state` в M6 должна быть правкой только этого модуля.
 */

/**
 * Единственный источник ключа хранилища — импортируется и писателем, и читателем.
 * Расхождение литералов в двух местах уже давало реальный баг (`useSongs` vs
 * `downloadSongs`), поэтому литерал здесь один.
 */
export const SONG_PERSONAL_KEYS_STORAGE_KEY = 'songs:keys';

type PersonalKeys = Record<string, string>;

/**
 * Подписчики на изменение личных тональностей. Нужны, чтобы React читал хранилище через
 * `useSyncExternalStore`: это внешний источник, а не React-состояние, и синхронизировать
 * его эффектом с `setState` нельзя (cascading renders, react-hooks/set-state-in-effect).
 */
const listeners = new Set<() => void>();

export function subscribePersonalKeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let warnedStorageUnavailable = false;

function warnStorageUnavailable(err: unknown): void {
  if (warnedStorageUnavailable) return;
  warnedStorageUnavailable = true;
  console.warn('[personalKeyStore] localStorage unavailable', err);
}

/**
 * Читает всю карту «песня → тональность». Недоступный localStorage (Safari private mode,
 * quota) или битый JSON — пустая карта, наружу не бросаем: отсутствие личной тональности
 * означает лишь откат на основную/исходную, ронять просмотр песни из-за этого нельзя.
 */
function readAll(): PersonalKeys {
  try {
    const raw = localStorage.getItem(SONG_PERSONAL_KEYS_STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Значения могли испортиться сторонним кодом — оставляем только строки.
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === 'string' && value !== '')) as PersonalKeys;
  } catch (err) {
    warnStorageUnavailable(err);
    return {};
  }
}

function writeAll(keys: PersonalKeys): void {
  try {
    localStorage.setItem(SONG_PERSONAL_KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch (err) {
    warnStorageUnavailable(err);
  }
  // Уведомляем и после неудачной записи: читатель тогда покажет фактическое состояние
  // хранилища, а не тональность, которую сохранить не удалось.
  for (const listener of listeners) listener();
}

/** Личная тональность песни, либо `undefined` если музыкант её не выбирал. */
export function readPersonalKey(songId: string): string | undefined {
  return readAll()[songId];
}

export function writePersonalKey(songId: string, key: string): void {
  writeAll({ ...readAll(), [songId]: key });
}

/** Сброс к основной/исходной тональности («сбросить» в селекторе). */
export function clearPersonalKey(songId: string): void {
  const keys = readAll();
  if (!(songId in keys)) return;
  delete keys[songId];
  writeAll(keys);
}

/** Только для тестов: сбрасывает флаг однократного warn. */
export function resetPersonalKeyWarnings(): void {
  warnedStorageUnavailable = false;
}
