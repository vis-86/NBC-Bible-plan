#!/usr/bin/env npx tsx
/**
 * Идемпотентная миграция Directus к командам: NBC становится командой №1.
 *
 *   apply                   — только добавляет и совместим со старым кодом BFF: коллекции
 *                             `teams`/`team_members`, nullable `team` у songs/setlists/auth_invites,
 *                             `songs.origin_song`, `auth_invites.role` (AppRole приглашённого),
 *                             команда `nbc`, роль Directus `team_admin` с политиками роли
 *                             musician_editor. Шаги фазы 1 — backfill `team IS NULL` → nbc
 *                             (кроме reset-инвайтов) и членство в nbc для ролей
 *                             «Чтец»/musician/musician_editor — выполняются, только пока `nbc` —
 *                             единственная команда; при нескольких командах они пропускаются
 *                             с предупреждением. Повторный запуск безопасен: уже сделанное
 *                             не повторяется.
 *                             Runbook: backfill обновляет строки песен и сетов, Directus поднимает
 *                             им `date_updated` → на устройствах однократная перекачка песен и сетов.
 *   finalize                — `team` NOT NULL в songs и setlists (после деплоя кода с командами).
 *                             Отказывает (код 1), если остались строки без команды.
 *   strip-user-permissions  — снимает с пользовательских политик права на коллекции, которые
 *                             приложение читает только admin-клиентом в BFF (список —
 *                             `STRIP_PERMISSIONS` в `scripts/add-teams/plan.ts`). Перед удалением
 *                             печатает строки целиком (JSON на строку) — вывод сохранить для отката.
 *
 * Запуск: `npx tsx scripts/add-teams.ts <apply|finalize|strip-user-permissions> --confirm-host=<host> [--dry-run]`
 * Хост цели — из `NEXT_PUBLIC_DIRECTUS_URL` (с портом, если он есть в URL). Не совпал
 * с `--confirm-host` — скрипт печатает хост цели и выходит с кодом 1, не сделав ни одного
 * запроса. `--dry-run` только читает и печатает запланированные изменения.
 * Требует env (из .env.local): NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN. На проде
 * admin-токен ротируется при пересборке — брать актуальный из окружения сервера.
 */
import { loadEnvConfig } from '@next/env';
import { LOG, run, type MigrationClient } from './add-teams/run';

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const { getDirectusAdminClient } = await import('../src/lib/directus');
  process.exitCode = await run(process.argv.slice(2), {
    directusUrl: process.env.NEXT_PUBLIC_DIRECTUS_URL,
    // Типы клиента приложения не знают о `teams`/`team_members` — у миграции своя схема.
    createClient: () => getDirectusAdminClient() as unknown as MigrationClient,
    log: console,
  });
}

main().catch((err) => {
  console.error(`${LOG} failed:`, err);
  process.exit(1);
});
