import { NextRequest, NextResponse } from 'next/server';

const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/**
 * Проксирует запрос к Directus с поддержкой admin token
 * @param path - путь в Directus (например, 'flows/trigger/flow-id')
 * @param request - оригинальный запрос
 * @param useAdminToken - использовать ли admin token вместо cookie
 */
export async function proxyToDirectus(
  path: string,
  request: NextRequest,
  useAdminToken: boolean = false
): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `${DIRECTUS_URL}/${path}${searchParams ? `?${searchParams}` : ''}`;

  const headers = new Headers(request.headers);
  // Удаляем host, чтобы Directus не ругался на неверный домен
  headers.delete('host');
  
  if (useAdminToken && DIRECTUS_ADMIN_TOKEN) {
    // Используем admin token вместо cookie
    headers.delete('cookie');
    headers.set('Authorization', `Bearer ${DIRECTUS_ADMIN_TOKEN}`);
  } else {
    // Важно: передаем cookie из запроса клиента в Directus
    const cookie = request.headers.get('cookie');
    if (cookie) {
      headers.set('cookie', cookie);
    }
  }

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





