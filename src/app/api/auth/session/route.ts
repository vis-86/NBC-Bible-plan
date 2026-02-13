import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    // В route handlers используем cookies() из next/headers
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    return NextResponse.json({
      user: {
        directus_id: session.directus_id,
        first_name: session.first_name,
        last_name: session.last_name,
        username: session.username,
      },
    });
  } catch (error) {
    console.error('Error getting session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

