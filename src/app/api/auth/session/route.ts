import { NextResponse } from 'next/server';
import { getSession, createSession } from '@/lib/session';
import { getDirectusAdminClient } from '@/lib/directus';
import { readUsers } from '@directus/sdk';

export async function GET() {
  try {
    // В route handlers используем cookies() из next/headers
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    // Cookie — снапшот профиля на момент логина (30 дней). Сессии, созданные до
    // заполнения имени в Directus (или до фикса чтения /users/me), несут first_name=''.
    // Поэтому при каждом чтении сессии подтягиваем актуальный профиль admin-клиентом
    // и пере-запечатываем cookie, если данные разошлись.
    let fresh = session;
    try {
      const admin = getDirectusAdminClient();
      const users = await admin.request(
        readUsers({
          filter: { id: { _eq: session.directus_id } },
          limit: 1,
          fields: ['first_name', 'last_name', 'email'],
        })
      );
      const profile = users[0] as
        | { first_name?: string | null; last_name?: string | null; email?: string | null }
        | undefined;
      if (profile) {
        fresh = {
          ...session,
          first_name: profile.first_name ?? '',
          last_name: profile.last_name ?? undefined,
          username: profile.email ?? session.username,
        };
        if (fresh.first_name !== session.first_name) {
          console.log('[FIX] session profile refreshed', {
            directus_id: session.directus_id,
            had_first_name: session.first_name !== '',
            has_first_name: fresh.first_name !== '',
          });
        }
      }
    } catch (error) {
      // Directus недоступен — не роняем сессию, отдаём данные из cookie.
      console.error('[FIX] session profile refresh failed', {
        directus_id: session.directus_id,
        error: (error as Error)?.message,
      });
    }

    const response = NextResponse.json({
      user: {
        directus_id: fresh.directus_id,
        first_name: fresh.first_name,
        last_name: fresh.last_name,
        username: fresh.username,
      },
    });

    const changed =
      fresh.first_name !== session.first_name ||
      fresh.last_name !== session.last_name ||
      fresh.username !== session.username;
    if (changed) {
      await createSession(fresh, response);
    }

    return response;
  } catch (error) {
    console.error('Error getting session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
