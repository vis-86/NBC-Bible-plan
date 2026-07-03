/**
 * Build-time версия приложения (ISO timestamp сборки), инлайнится в бандл через
 * `env.NEXT_PUBLIC_APP_BUILD_TIME` в next.config.ts. Используется в секции
 * «Оффлайн-данные» настроек (Task 30).
 */
export function getAppBuildTime(): string | null {
  return process.env.NEXT_PUBLIC_APP_BUILD_TIME ?? null;
}
