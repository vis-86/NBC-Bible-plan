/**
 * Скорость автоскролла — per-song устройство-локальное хранилище (§8).
 *
 * Зеркалит `personalKeyStore.ts`: узкий API, единый listener-набор для
 * `useSyncExternalStore`, graceful fallback при недоступном/битом localStorage.
 * У каждой песни своя ступень; песня без собственной записи наследует последнюю
 * ГЛОБАЛЬНО выбранную ступень, а если и её нет — `DEFAULT_STEP_INDEX`.
 */

import { AUTOSCROLL_STEPS, DEFAULT_STEP_INDEX, clampStepIndex } from './autoScroll';

/** Единственный источник ключа карты «песня → ступень» — импортируется читателем и писателем. */
export const SONG_AUTOSCROLL_SPEED_STORAGE_KEY = 'songs:autoscroll-speed';

/** Глобальная «последняя выбранная ступень» — дефолт для песни без своей записи. */
export const SONG_AUTOSCROLL_LAST_STORAGE_KEY = 'songs:autoscroll-last';

type SpeedMap = Record<string, number>;

const listeners = new Set<() => void>();

export function subscribeAutoScrollSpeed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let warnedStorageUnavailable = false;

function warnStorageUnavailable(err: unknown): void {
  if (warnedStorageUnavailable) return;
  warnedStorageUnavailable = true;
  console.warn('[autoScrollSpeedStore] localStorage unavailable', err);
}

function isValidStepIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < AUTOSCROLL_STEPS.length;
}

function readAll(): SpeedMap {
  try {
    const raw = localStorage.getItem(SONG_AUTOSCROLL_SPEED_STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => isValidStepIndex(value))) as SpeedMap;
  } catch (err) {
    warnStorageUnavailable(err);
    return {};
  }
}

function writeAll(speeds: SpeedMap): void {
  try {
    localStorage.setItem(SONG_AUTOSCROLL_SPEED_STORAGE_KEY, JSON.stringify(speeds));
  } catch (err) {
    warnStorageUnavailable(err);
  }
  for (const listener of listeners) listener();
}

function readLast(): number | null {
  try {
    const raw = localStorage.getItem(SONG_AUTOSCROLL_LAST_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return isValidStepIndex(parsed) ? parsed : null;
  } catch (err) {
    warnStorageUnavailable(err);
    return null;
  }
}

function writeLast(step: number): void {
  try {
    localStorage.setItem(SONG_AUTOSCROLL_LAST_STORAGE_KEY, String(step));
  } catch (err) {
    warnStorageUnavailable(err);
  }
}

/** Ступень песни: своя запись, иначе последняя глобальная, иначе `DEFAULT_STEP_INDEX`. */
export function readSpeedStep(songId: string): number {
  const own = readAll()[songId];
  if (isValidStepIndex(own)) return own;
  const last = readLast();
  return last !== null ? last : DEFAULT_STEP_INDEX;
}

/** Пишет ступень песни И глобальную «последнюю» одновременно, затем уведомляет подписчиков. */
export function writeSpeedStep(songId: string, step: number): void {
  const clamped = clampStepIndex(step);
  writeLast(clamped);
  writeAll({ ...readAll(), [songId]: clamped });
}

/** Только для тестов: сбрасывает флаг однократного warn. */
export function resetAutoScrollSpeedWarnings(): void {
  warnedStorageUnavailable = false;
}
