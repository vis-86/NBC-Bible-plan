import { NextResponse } from 'next/server';
import { getSongsList } from '@/features/songs/services/songsServer';

/**
 * GET /api/songs
 * Список песен (краткие карточки) через admin-клиент Directus (arch: proxy).
 */
export async function GET() {
  try {
    const songs = await getSongsList();
    return NextResponse.json({ songs });
  } catch (error) {
    console.error('[Songs API] list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
