import { z } from 'zod';
import { LOGIN_HANDLE_MAX, LOGIN_HANDLE_MIN, LOGIN_HANDLE_PATTERN } from './login-handle';

/**
 * Логин (handle) — псевдоним, НЕ настоящие имя/телефон (ФЗ-152).
 * Латиница/цифры/._- , 3–32 символа.
 */
export const LoginHandleSchema = z
  .string()
  .min(LOGIN_HANDLE_MIN, `Логин: минимум ${LOGIN_HANDLE_MIN} символа`)
  .max(LOGIN_HANDLE_MAX, `Логин: максимум ${LOGIN_HANDLE_MAX} символа`)
  .regex(LOGIN_HANDLE_PATTERN, 'Логин: только латиница, цифры, точка, дефис, подчёркивание');

export const PasswordSchema = z
  .string()
  .min(8, 'Пароль: минимум 8 символов')
  .max(128, 'Пароль: максимум 128 символов');

export const DisplayNameSchema = z.string().trim().min(1).max(64);

/** Вход по логину+паролю. Допускаем email с доменом (backward-compat) или handle. */
export const LoginSchema = z.object({
  login: z.string().min(1, 'Укажите логин').max(255),
  password: z.string().min(1, 'Укажите пароль').max(128),
});

/**
 * Активация по invite-токену (создание аккаунта) ИЛИ сброс пароля (reset-токен).
 * Для activation требуются login + displayName; для reset — только password.
 * Конкретная проверка по типу токена — в route handler.
 */
export const ActivateSchema = z.object({
  token: z.string().min(10, 'Некорректный токен'),
  login: LoginHandleSchema.optional(),
  displayName: DisplayNameSchema.optional(),
  password: PasswordSchema,
});

/** Привязка Telegram к существующему аккаунту (mini-app). */
export const TelegramLinkSchema = z.object({
  initData: z.string().min(1, 'Отсутствует initData'),
  login: z.string().min(1, 'Укажите логин').max(255),
  password: z.string().min(1, 'Укажите пароль').max(128),
});

/** Создание invite/reset ссылки (admin-only эндпоинт). */
export const InviteCreateSchema = z.object({
  kind: z.enum(['activate', 'reset']),
  userId: z.string().optional(),
});

/**
 * Самостоятельная регистрация.
 * login + password создают псевдонимный аккаунт ({login}@local.baptistnn.ru, без PII);
 * churchCode — общий секрет церкви. ОПЦИОНАЛЕН: в режиме «без кода» (REGISTER_OPEN_NO_CODE)
 * поле может отсутствовать. Обязательность и само сравнение — на сервере
 * (register-access: isChurchCodeRequired + verifyChurchCode, timing-safe). Здесь только формат.
 */
export const RegisterSchema = z.object({
  login: LoginHandleSchema,
  displayName: DisplayNameSchema.optional(),
  password: PasswordSchema,
  churchCode: z.string().max(128).optional(),
  /** initData mini-app: регистрация из Telegram сразу привязывает tg_id (best-effort). */
  telegramInitData: z.string().max(4096).optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type ActivateInput = z.infer<typeof ActivateSchema>;
export type TelegramLinkInput = z.infer<typeof TelegramLinkSchema>;
export type InviteCreateInput = z.infer<typeof InviteCreateSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;

/** Хелпер: первое сообщение об ошибке из ZodError (zod v4: .issues). */
export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Некорректные данные';
}
