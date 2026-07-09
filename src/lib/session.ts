/**
 * Next-обёртки над framework-agnostic ядром сессий (session-core.ts).
 * Живут до cutover static export (T6) — их используют src/app/api/* и middleware.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  sealSession,
  sessionCookieOptions,
  unsealSession,
  type SessionData,
} from './session-core';

export { SESSION_COOKIE_NAME, SESSION_TTL, sealSession, sessionCookieOptions, unsealSession } from './session-core';
export type { SessionData } from './session-core';

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[session]', ...args);
}

/**
 * Создаёт сессию пользователя (запечатанный cookie).
 */
export async function createSession(
  userData: SessionData,
  response?: NextResponse
): Promise<NextResponse> {
  const sealed = await sealSession(userData);
  const res = response || NextResponse.next();

  res.cookies.set(SESSION_COOKIE_NAME, sealed, sessionCookieOptions());

  debug('session sealed for user', userData.directus_id);
  return res;
}

/**
 * Получает данные сессии из запроса (для использования в middleware).
 * Использует только request.cookies, т.к. cookies() из next/headers не работает в middleware.
 */
export async function getSessionFromRequest(request: NextRequest): Promise<SessionData | null> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) return null;
  return unsealSession(sessionCookie.value);
}

/**
 * Получает данные сессии (для использования в route handlers).
 * В Next.js 15+ cookies() возвращает Promise.
 */
export async function getSession(): Promise<SessionData | null> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!sessionCookie?.value) return null;
    return unsealSession(sessionCookie.value);
  } catch (error) {
    debug('getSession failed:', error);
    return null;
  }
}

/**
 * Удаляет сессию пользователя.
 */
export function deleteSession(response?: NextResponse): NextResponse {
  const res = response || NextResponse.next();
  res.cookies.delete({ name: SESSION_COOKIE_NAME, path: '/' });
  return res;
}
