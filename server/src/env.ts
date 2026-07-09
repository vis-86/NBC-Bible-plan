/**
 * Env-конфиг BFF. Секреты валидируются лениво (throw на первом использовании,
 * не на импорте) — как в src/lib/session.ts: сборка/тесты без прод-секретов
 * должны работать.
 */
import { z } from 'zod';

const envSchema = z.object({
  BFF_PORT: z.string().optional(),
  DIRECTUS_URL: z.string().optional(),
  DIRECTUS_ADMIN_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  INVITE_ADMIN_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  REGISTER_CHURCH_CODE: z.string().optional(),
  REGISTER_OPEN_NO_CODE: z.string().optional(),
  DIRECTUS_AI_FLOW_ID: z.string().optional(),
  NEXT_PUBLIC_DIRECTUS_URL: z.string().optional(),
  NEXT_PUBLIC_AI_ENABLE: z.string().optional(),
  NEXT_PUBLIC_BASE_PATH: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  // Без кэша: process.env мутируется в тестах, а parse оптional-строк дёшев.
  return envSchema.parse(process.env);
}

export function requireEnv(key: keyof Env): string {
  const value = getEnv()[key];
  if (!value) {
    throw new Error(`[bff] missing required env: ${key}`);
  }
  return value;
}

export function bffPort(): number {
  return Number(getEnv().BFF_PORT ?? 3001);
}

export function basePath(): string {
  return getEnv().NEXT_PUBLIC_BASE_PATH ?? '/app';
}

export function logLevel(): string {
  return getEnv().LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
}
