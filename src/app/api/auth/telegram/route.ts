import { NextRequest, NextResponse } from 'next/server';
import { verifyTelegramInitData } from '@/lib/telegram-server';

export async function POST(request: NextRequest) {
  try {
    const { initData } = await request.json();

    if (!initData) {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN is not set in environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const result = verifyTelegramInitData(initData, botToken);

    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    // Here you could potentially create a session or return a token
    // For now, we just return the verified user data
    return NextResponse.json({ 
      success: true, 
      user: result.user 
    });
  } catch (error) {
    console.error('API Auth Telegram error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
