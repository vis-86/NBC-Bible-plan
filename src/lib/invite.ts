// @ts-nocheck - Directus SDK typing issue with custom schema (см. directus-user.ts)
import crypto from 'crypto';
import { getDirectusAdminClient } from './directus';
import { readItems, createItem, updateItem } from '@directus/sdk';

/**
 * Stateful invite/reset токены в коллекции Directus `auth_invites`.
 * Одноразовость = поле `used_at`, TTL = поле `expires_at` самой записи.
 * Секрет ссылки = поле `token` (unique). HMAC/`INVITE_SECRET` больше не используются.
 */

export type InviteKind = 'activate' | 'reset';

export interface ValidInvite {
  /** id записи auth_invites (для consumeInvite) */
  id: number;
  kind: InviteKind;
  /** reset: id целевого пользователя; activate: null до активации */
  user: string | null;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 дней

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[invite]', ...args);
}

/**
 * Ищет валидную invite-запись по токену: не использована и не просрочена.
 * @returns { id, kind, user } или null, если токен не найден/использован/просрочен.
 */
export async function findValidInvite(token: string): Promise<ValidInvite | null> {
  if (!token) {
    debug('empty token');
    return null;
  }
  const admin = getDirectusAdminClient();
  const rows = await admin.request(
    readItems('auth_invites', {
      filter: {
        token: { _eq: token },
        used_at: { _null: true },
        expires_at: { _gt: new Date().toISOString() },
      },
      limit: 1,
      fields: ['id', 'kind', 'user'],
    })
  );
  const invite = rows[0];
  if (!invite) {
    debug('no valid invite for token');
    return null;
  }
  debug('valid invite found id=%s kind=%s', invite.id, invite.kind);
  return { id: invite.id, kind: invite.kind, user: invite.user ?? null };
}

/**
 * Помечает invite использованным (one-time). Для activate-приглашений дополнительно
 * проставляет `user` = id созданного аккаунта.
 *
 * ⚠️ Гонка одноразовости: проверка `used_at` (в findValidInvite) и эта запись не атомарны —
 * два параллельных активейта теоретически могут оба создать аккаунт. Для закрытого круга
 * (все известны лично, invite одноразовый + TTL) риск принят осознанно.
 */
export async function consumeInvite(id: number, createdUserId?: string): Promise<void> {
  const admin = getDirectusAdminClient();
  const patch: { used_at: string; user?: string } = { used_at: new Date().toISOString() };
  if (createdUserId) patch.user = createdUserId;
  await admin.request(updateItem('auth_invites', id, patch));
  debug('invite consumed id=%s user=%s', id, createdUserId ?? '-');
}

/**
 * Программно создаёт invite/reset запись. Генерит token/expires_at/invite_url app-side
 * (НЕ полагается на Directus Flow — Flow обслуживает только ручной admin-UI путь).
 * @returns { url, token } — готовая ссылка для передачи пользователю.
 */
export async function createInvite(input: {
  kind: InviteKind;
  userId?: string;
  label?: string;
  ttlSeconds?: number;
}): Promise<{ url: string; token: string }> {
  const token = crypto.randomUUID();
  const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const url = `${appUrl}${basePath}/activate?token=${encodeURIComponent(token)}&mode=${input.kind}`;

  const admin = getDirectusAdminClient();
  await admin.request(
    createItem('auth_invites', {
      token,
      kind: input.kind,
      user: input.userId ?? null,
      label: input.label ?? null,
      expires_at: expiresAt,
      used_at: null,
      invite_url: url,
    })
  );
  debug('invite created kind=%s user=%s', input.kind, input.userId ?? '-');
  return { url, token };
}
