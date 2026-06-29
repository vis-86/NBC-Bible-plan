import { NextRequest, NextResponse } from 'next/server';
import { signInviteToken } from '@/lib/invite';
import { InviteCreateSchema, firstZodError } from '@/lib/validators/auth.schemas';

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[invite-create]', ...args);
}

/**
 * POST /api/auth/invite/create  (admin-only)
 * Защита: header `Authorization: Bearer ${INVITE_ADMIN_SECRET}`.
 * Body: { kind: 'activate' | 'reset', userId?: string }
 * Response: { url } — ссылка для активации/сброса (передаётся пользователю любым каналом).
 *
 * Поддержка может выдавать reset-ссылку по userId (находя юзера в Directus Admin).
 */
export async function POST(request: NextRequest) {
  const adminSecret = process.env.INVITE_ADMIN_SECRET;
  const auth = request.headers.get('authorization');
  if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const parsed = InviteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }
  const { kind, userId } = parsed.data;

  if (kind === 'reset' && !userId) {
    return NextResponse.json({ error: 'Для reset требуется userId' }, { status: 400 });
  }

  const token = signInviteToken({ kind, userId });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const url = `${appUrl}${basePath}/activate?token=${encodeURIComponent(token)}`;

  debug('issued %s url for userId=%s', kind, userId ?? '-');
  return NextResponse.json({ url, token });
}
