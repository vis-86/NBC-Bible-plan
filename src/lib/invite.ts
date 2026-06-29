// @ts-nocheck - Directus SDK typing issue with custom schema (см. directus-user.ts)
import crypto from 'crypto';
import { getDirectusAdminClient } from './directus';
import { readItems, createItem } from '@directus/sdk';

/**
 * Invite/reset токены: HMAC-SHA256-подписанный компактный токен
 * `base64url(payload).base64url(sig)`. Подпись на INVITE_SECRET.
 * Одноразовость — через коллекцию Directus `auth_used_tokens` (хранится только jti).
 */

export type InviteKind = 'activate' | 'reset';

export interface InvitePayload {
  kind: InviteKind;
  /** уникальный id токена для one-time проверки */
  jti: string;
  /** unix-секунды истечения */
  exp: number;
  /** для reset — id существующего пользователя Directus */
  userId?: string;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 дней

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[invite]', ...args);
}

function getSecret(): string {
  const secret = process.env.INVITE_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('INVITE_SECRET is not set or too short. Generate with: openssl rand -hex 32');
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

/** Подписывает токен. `ttlSeconds` по умолчанию 7 дней. */
export function signInviteToken(
  input: { kind: InviteKind; userId?: string },
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const payload: InvitePayload = {
    kind: input.kind,
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    ...(input.userId ? { userId: input.userId } : {}),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const token = `${payloadB64}.${sign(payloadB64)}`;
  debug('token issued kind=%s jti=%s', payload.kind, payload.jti);
  return token;
}

async function isJtiUsed(jti: string): Promise<boolean> {
  const admin = getDirectusAdminClient();
  const rows = await admin.request(
    readItems('auth_used_tokens', { filter: { jti: { _eq: jti } }, limit: 1 })
  );
  return rows.length > 0;
}

/**
 * Проверяет токен: подпись (timing-safe), срок, одноразовость.
 * @returns payload или null, если токен невалиден/просрочен/использован.
 */
export async function verifyInviteToken(token: string): Promise<InvitePayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) {
    debug('malformed token');
    return null;
  }
  const [payloadB64, sig] = parts;

  const expected = sign(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    debug('bad signature');
    return null;
  }

  let payload: InvitePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    debug('bad payload json');
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    debug('expired jti=%s', payload.jti);
    return null;
  }

  if (await isJtiUsed(payload.jti)) {
    debug('already used jti=%s', payload.jti);
    return null;
  }

  return payload;
}

/** Помечает токен использованным (one-time). Идемпотентно по unique-констрейнту jti. */
export async function consumeToken(jti: string): Promise<void> {
  const admin = getDirectusAdminClient();
  await admin.request(createItem('auth_used_tokens', { jti, used_at: new Date().toISOString() }));
  debug('token consumed jti=%s', jti);
}
