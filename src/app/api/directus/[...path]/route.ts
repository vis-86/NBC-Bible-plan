import { NextRequest, NextResponse } from 'next/server';
import { proxyToDirectus } from '@/lib/directus-proxy';

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = path.join('/');
  
  // Проверяем, нужен ли admin token для этого запроса
  // Если в заголовке X-Use-Admin-Token установлено значение, используем admin token
  const useAdminToken = request.headers.get('x-use-admin-token') === 'true';
  
  // Удаляем служебный заголовок, чтобы он не попал в Directus
  const headers = new Headers(request.headers);
  headers.delete('x-use-admin-token');
  const modifiedRequest = new NextRequest(request.url, {
    method: request.method,
    headers: headers,
    body: request.body,
  });
  
  return proxyToDirectus(targetPath, modifiedRequest, useAdminToken);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const PUT = handler;
