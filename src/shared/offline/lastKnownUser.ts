import { getDB } from './db';

/**
 * Офлайн-вход: последний подтверждённый сервером пользователь, сохранённый в IDB.
 * Используется ТОЛЬКО как фолбэк при сетевой ошибке в AuthProvider.checkSession
 * (Task 24, .ai-factory/plans/feature-offline-pwa.md) — не при `response.ok === false`
 * / `user: null`, это настоящее «сессии нет».
 */

const LAST_KNOWN_USER_KEY = 'last-known-user';

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[offline/lastKnownUser]', ...args);
}

export async function getLastKnownUser<T>(): Promise<T | undefined> {
  try {
    const db = await getDB();
    const record = await db.get('meta', LAST_KNOWN_USER_KEY);
    return record?.value as T | undefined;
  } catch (err) {
    debug('read failed', err);
    return undefined;
  }
}

export async function setLastKnownUser(user: unknown): Promise<void> {
  try {
    const db = await getDB();
    await db.put('meta', { key: LAST_KNOWN_USER_KEY, value: user });
  } catch (err) {
    debug('write failed', err);
  }
}

/** Обязателен на logout() — иначе устройство остаётся «офлайн-залогинено» после выхода. */
export async function clearLastKnownUser(): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('meta', LAST_KNOWN_USER_KEY);
  } catch (err) {
    debug('clear failed', err);
  }
}
