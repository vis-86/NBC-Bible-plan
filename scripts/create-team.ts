#!/usr/bin/env npx tsx
/**
 * Заводит команду и выдаёт ссылку-приглашение её первому администратору (`team_admin`).
 *
 * Запуск: `npx tsx scripts/create-team.ts --name="Церковь X" --slug=church-x --confirm-host=<host> [--dry-run]`
 * Хост цели — из `NEXT_PUBLIC_DIRECTUS_URL` (с портом, если он есть в URL). Не совпал
 * с `--confirm-host` — скрипт печатает хост цели и выходит с кодом 1, не сделав ни одного запроса.
 * Команда с таким slug уже есть и имя то же — создаётся только НОВЫЙ инвайт (так можно перевыпустить
 * потерянную ссылку); имя другое — код 1. `--dry-run` только читает.
 * Перед записью проверяет, что `add-teams strip-user-permissions` уже выполнен: иначе код 1 (в --dry-run — предупреждение).
 * Для ссылки нужен `WORSHIP_APP_URL`: без него команда создаётся, а выпуск инвайта падает — повторный
 * запуск с тем же slug и именем дочинит. Требует env (из .env.local): NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, NEXT_PUBLIC_APP_URL.
 */
import { loadEnvConfig } from '@next/env';
import { LOG, run, type TeamsClient } from './create-team/run';

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const { getDirectusAdminClient } = await import('../src/lib/directus');
  const { createInvite } = await import('../src/lib/invite');
  process.exitCode = await run(process.argv.slice(2), {
    directusUrl: process.env.NEXT_PUBLIC_DIRECTUS_URL,
    // Типы клиента приложения не знают о `teams` — у скрипта своя схема.
    createClient: () => getDirectusAdminClient() as unknown as TeamsClient,
    issueInvite: ({ teamId, label }) =>
      createInvite({ kind: 'activate', teamId, role: 'team_admin', label }),
    log: console,
  });
}

main().catch((err) => {
  console.error(`${LOG} failed:`, err);
  process.exit(1);
});
