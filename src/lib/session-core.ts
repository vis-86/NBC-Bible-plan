/**
 * Framework-agnostic ядро сессий: seal/unseal iron-session + константы cookie.
 * НЕ импортирует ничего из next/* — используется и Next-роутами (src/lib/session.ts),
 * и Hono BFF (server/src/session.ts).
 */
import { sealData, unsealData } from 'iron-session';

export interface SessionData {
  directus_id: string;
  first_name: string;
  last_name?: string;
  username?: string;
}

export const SESSION_COOKIE_NAME = 'bible-plan-session';
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 дней (секунды)

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[session]', ...args);
}

/**
 * path: '/' обязателен — cookie должна отправляться на /app/api/* при basePath.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_TTL,
    path: '/',
  };
}

/**
 * Лениво читает SESSION_SECRET. НЕ валидируем на уровне импорта модуля —
 * иначе сборка падает, когда секрет недоступен на этапе сборки.
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
  return { password: getSessionPassword(), ttl: SESSION_TTL };
}

export async function sealSession(data: SessionData): Promise<string> {
  return sealData(data, sealOptions());
}

export async function unsealSession(cookieValue: string): Promise<SessionData | null> {
  try {
    const data = await unsealData<SessionData>(cookieValue, sealOptions());
    // iron-session возвращает {} для просроченного/невалидного payload
    if (!data || !('directus_id' in data) || !data.directus_id) return null;
    return data;
  } catch (error) {
    debug('unseal failed:', error);
    return null;
  }
}
