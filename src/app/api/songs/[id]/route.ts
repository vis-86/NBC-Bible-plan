import { NextRequest, NextResponse } from 'next/server';
import { getSongById } from '@/features/songs/services/songsServer';

/**
 * GET /api/songs/[id]
 * Одна песня с полным ChordPro-контентом. 404 если не найдена.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numericId = Number(id);

    if (!Number.isInteger(numericId) || numericId < 1) {
      return NextResponse.json({ error: 'Invalid song id' }, { status: 400 });
    }

    const song = await getSongById(numericId);
    if (!song) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ song });
  } catch (error) {
    console.error('[Songs API] detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
