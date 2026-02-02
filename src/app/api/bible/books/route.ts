import { NextResponse } from 'next/server';
import { getAllBooks } from '@/lib/bible-data';

/**
 * GET /api/bible/books
 * Получает список всех книг Библии с количеством глав
 */
export async function GET() {
  try {
    const books = getAllBooks();
    
    return NextResponse.json({
      books
    });
    
  } catch (error) {
    console.error('[Bible Books API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


