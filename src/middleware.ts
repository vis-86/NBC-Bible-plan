import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const basePath = request.nextUrl.basePath || '';
  
  // Защищенные маршруты (учитываем basePath)
  const protectedPaths = ['/dashboard'];
  const pathname = request.nextUrl.pathname;
  
  // Убираем basePath из pathname для проверки (только если pathname начинается с basePath)
  let pathWithoutBase = pathname;
  if (basePath && pathname.startsWith(basePath)) {
    pathWithoutBase = pathname.slice(basePath.length) || '/';
  }
  
  const isProtectedPath = protectedPaths.some(path => 
    pathWithoutBase.startsWith(path)
  );

  if (isProtectedPath) {
    const session = await getSessionFromRequest(request);
    
    if (!session) {
      // Редирект на страницу логина с учетом basePath
      // Определяем правильный хост из заголовков прокси или используем текущий URL
      const forwardedHost = request.headers.get('x-forwarded-host');
      const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
      
      // Формируем базовый URL с учетом прокси
      const baseUrl = forwardedHost 
        ? `${forwardedProto}://${forwardedHost}`
        : request.nextUrl.origin;
      
      // Формируем путь логина с учетом basePath
      const loginPath = basePath ? `${basePath}/login` : '/login';
      const loginUrl = new URL(loginPath, baseUrl);
      // Сохраняем полный путь с basePath в redirect параметре
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

