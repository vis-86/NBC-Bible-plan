/**
 * Хелперы логин ↔ синтетический email. Отдельный модуль, а НЕ часть `directus-user.ts`:
 * тот тянет `getDirectusAdminClient` + `@directus/sdk` (server-only), и импорт из
 * клиентского компонента затащил бы admin-SDK в браузерный бандл.
 *
 * Этот модуль обязан оставаться без зависимостей.
 */

/**
 * Синтетический email-домен для псевдонимных веб-аккаунтов (без реальных ПД, ФЗ-152).
 * Должен быть с реальным TLD: Directus валидирует формат email и отклоняет
 * single-label домены вроде `@local` ("Value has to be a valid email address").
 * `local.baptistnn.ru` — поддомен своего домена без MX: формат валиден, почта не доставляется.
 */
export const LOCAL_EMAIL_DOMAIN = 'local.baptistnn.ru';

/** Преобразует логин-handle в синтетический email `{login}@local.baptistnn.ru`. */
export function loginToEmail(login: string): string {
  return login.includes('@') ? login : `${login.toLowerCase()}@${LOCAL_EMAIL_DOMAIN}`;
}

/**
 * Обратное преобразование: синтетический email → логин-handle.
 * @returns логин или `null`, если email не наш синтетический (реальный адрес,
 * telegram-аккаунт, пустое значение) — в этом случае «логина» в смысле входа нет
 * и показывать пользователю нечего.
 */
export function emailToLogin(email: string | null | undefined): string | null {
  if (!email) return null;
  const suffix = `@${LOCAL_EMAIL_DOMAIN}`;
  if (!email.toLowerCase().endsWith(suffix)) return null;
  const login = email.slice(0, -suffix.length);
  return login.length > 0 ? login : null;
}
