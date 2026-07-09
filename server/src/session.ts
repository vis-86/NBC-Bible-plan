/**
 * Hono-хелперы сессии поверх ядра src/lib/session-core.ts.
 * Значения cookie в логи не пишем — только directus_id.
 */
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  SESSION_COOKIE_NAME,
  sealSession,
  sessionCookieOptions,
  unsealSession,
  type SessionData,
} from '../../src/lib/session-core';
import { logger } from './logger';

export type { SessionData };

export async function getSession(c: Context): Promise<SessionData | null> {
  const value = getCookie(c, SESSION_COOKIE_NAME);
  if (!value) return null;
  return unsealSession(value);
}

export async function createSession(c: Context, data: SessionData): Promise<void> {
  const sealed = await sealSession(data);
  setCookie(c, SESSION_COOKIE_NAME, sealed, sessionCookieOptions());
  logger.debug(`session created for user ${data.directus_id}`);
}

export function deleteSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: sessionCookieOptions().path });
  logger.debug('session deleted');
}
