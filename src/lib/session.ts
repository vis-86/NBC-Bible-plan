import { NextRequest, NextResponse } from 'next/server';
import { sealData, unsealData } from 'iron-session';

export interface SessionData {
  directus_id: string;
  first_name: string;
  last_name?: string;
  username?: string;
}

const SESSION_COOKIE_NAME = 'bible-plan-session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней (секунды)

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[session]', ...args);
}

/**
 * Лениво читает SESSION_SECRET. НЕ валидируем на уровне импорта модуля —
 * иначе `next build` (standalone/CI) падает, когда секрет недоступен на этапе сборки.
 * Бросаем только во время реального запроса (seal/unseal).
 */
function getSessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET is not set or shorter than 32 chars. Cannot seal/unseal session. ' +
        'Generate with: openssl rand -hex 32'
    );
  }
  return secret;
}

function sealOptions() {
  return { password: getSessionPassword(), ttl: SESSION_MAX_AGE };
}

async function seal(data: SessionData): Promise<string> {
  return sealData(data, sealOptions());
}

async function unseal(sealed: string): Promise<SessionData | null> {
  try {
    const data = await unsealData<SessionData>(sealed, sealOptions());
    // iron-session возвращает {} для просроченного/невалидного payload
    if (!data || !('directus_id' in data) || !data.directus_id) return null;
    return data;
  } catch (error) {
    debug('unseal failed:', error);
    return null;
  }
}

/**
 * Создаёт сессию пользователя (запечатанный cookie).
 * path: '/' — cookie отправляется на все пути (в т.ч. /app/api/...) при basePath.
 */
export async function createSession(
  userData: SessionData,
  response?: NextResponse
): Promise<NextResponse> {
  const sealed = await seal(userData);
  const res = response || NextResponse.next();

  res.cookies.set(SESSION_COOKIE_NAME, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });

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
  return unseal(sessionCookie.value);
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
    return unseal(sessionCookie.value);
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
