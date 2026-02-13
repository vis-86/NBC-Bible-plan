import { NextRequest, NextResponse } from 'next/server';

export interface SessionData {
  directus_id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  /** Токен Directus для запросов от имени пользователя (при входе по логину/паролю) */
  access_token?: string;
}

const SESSION_COOKIE_NAME = 'bible-plan-session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

/**
 * Создает сессию пользователя.
 * path: '/' — cookie отправляется на все пути (в т.ч. /app/api/...) при basePath.
 */
export function createSession(userData: SessionData, response?: NextResponse): NextResponse {
  const sessionValue = JSON.stringify(userData);
  
  const res = response || NextResponse.next();
  
  res.cookies.set(SESSION_COOKIE_NAME, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });

  return res;
}

/**
 * Получает данные сессии из запроса (для использования в middleware)
 * Использует только request.cookies, так как cookies() из next/headers не работает в middleware
 */
export function getSessionFromRequest(request: NextRequest): SessionData | null {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
    
    if (!sessionCookie?.value) {
      return null;
    }

    const sessionData = JSON.parse(sessionCookie.value) as SessionData;
    return sessionData;
  } catch (error) {
    console.error('Error reading session:', error);
    return null;
  }
}

/**
 * Получает данные сессии (для использования в route handlers)
 * Использует cookies() из next/headers
 * В Next.js 15+ cookies() возвращает Promise
 */
export async function getSession(): Promise<SessionData | null> {
  try {
    // Динамический импорт, чтобы избежать проблем в middleware
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    
    if (!sessionCookie?.value) {
      return null;
    }

    const sessionData = JSON.parse(sessionCookie.value) as SessionData;
    return sessionData;
  } catch (error) {
    console.error('Error reading session:', error);
    return null;
  }
}

/**
 * Удаляет сессию пользователя
 */
export function deleteSession(response?: NextResponse): NextResponse {
  const res = response || NextResponse.next();
  
  res.cookies.delete({
    name: SESSION_COOKIE_NAME,
    path: '/',
  });
  
  return res;
}

/**
 * Проверяет, является ли ошибка от Directus признаком истёкшего токена (401).
 */
export function isTokenExpiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; response?: { status?: number } };
  if (e.message?.includes?.('Token expired')) return true;
  if (e.response?.status === 401) return true;
  return false;
}

