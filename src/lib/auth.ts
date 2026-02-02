import { directus } from './directus';
import { readMe } from '@directus/sdk';

/**
 * Проверяет, авторизован ли пользователь
 * @returns true если пользователь авторизован, false в противном случае
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    // В режиме 'cookie' мы не можем просто проверить наличие токена через getToken(),
    // так как он находится в HttpOnly cookie. Делаем запрос readMe() для проверки сессии.
    await directus.request(readMe({ fields: ['id'] }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Получает текущего авторизованного пользователя
 * @returns данные пользователя или null если не авторизован
 */
export async function getCurrentUser() {
  try {
    const user = await directus.request(readMe({
      fields: ['*', 'role.*'] as any
    }));
    return user || null;
  } catch {
    return null;
  }
}
