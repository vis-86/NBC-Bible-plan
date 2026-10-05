/**
 * Правило логина (handle) — общий источник для серверной zod-схемы и инлайн-проверки
 * в форме регистрации. Без zod намеренно: модуль попадает в клиентский бандл.
 */

export const LOGIN_HANDLE_MIN = 3;
export const LOGIN_HANDLE_MAX = 32;
export const LOGIN_HANDLE_PATTERN = /^[a-zA-Z0-9._-]+$/;

export const LOGIN_HANDLE_HINT = 'Латинские буквы, цифры, точка, дефис или _ — от 3 символов';

/**
 * Человеческое сообщение о проблеме с логином или `null`, если логин валиден.
 * Кириллица — частый случай (русская раскладка), для неё отдельная подсказка.
 */
export function loginHandleError(value: string): string | null {
  if (/[а-яё]/i.test(value)) return 'Логин пишется латиницей — переключите клавиатуру на английский';
  if (/\s/.test(value)) return 'В логине не должно быть пробелов';
  if (value.length < LOGIN_HANDLE_MIN) return `Логин: минимум ${LOGIN_HANDLE_MIN} символа`;
  if (value.length > LOGIN_HANDLE_MAX) return `Логин: максимум ${LOGIN_HANDLE_MAX} символа`;
  if (!LOGIN_HANDLE_PATTERN.test(value)) return 'Логин: только латиница, цифры, точка, дефис, подчёркивание';
  return null;
}
