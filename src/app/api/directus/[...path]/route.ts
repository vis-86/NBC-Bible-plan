import { NextRequest, NextResponse } from 'next/server';

const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const searchParams = request.nextUrl.searchParams.toString();
  const targetPath = path.join('/');
  const url = `${DIRECTUS_URL}/${targetPath}${searchParams ? `?${searchParams}` : ''}`;

  const headers = new Headers(request.headers);
  // Удаляем host, чтобы Directus не ругался на неверный домен
  headers.delete('host');
  // Можно добавить дополнительные заголовки, если нужно

  try {
    const options: RequestInit = {
      method: request.method,
      headers: headers,
      // В Next.js request.body является ReadableStream, что удобно для fetch
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      // @ts-ignore - дуплекс необходим при передаче ReadableStream в качестве body
      duplex: 'half',
    };

    const response = await fetch(url, options);

    // Копируем все заголовки ответа, включая Set-Cookie
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Некоторые заголовки Next.js/браузер могут не пропустить, но Set-Cookie критичен
      responseHeaders.set(key, value);
    });

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const PUT = handler;
