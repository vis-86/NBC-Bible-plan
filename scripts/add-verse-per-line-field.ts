#!/usr/bin/env npx tsx
/**
 * Idempotent: добавляет поле `verse_per_line` (boolean, default false) в
 * существующую Directus-коллекцию `reading_settings`.
 *
 * Запуск: `npx tsx scripts/add-verse-per-line-field.ts`
 * Требует env (из .env.local): NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN.
 * На проде — тот же скрипт, тем же способом (см. .ai-factory/PLAN.md, "Внешние шаги"):
 * прод-admin-токен ротируется при пересборке — брать актуальный из окружения сервера.
 */
import { loadEnvConfig } from '@next/env';
import { createField, readFieldsByCollection } from '@directus/sdk';

const LOG = '[add-verse-per-line-field]';
const COLLECTION = 'reading_settings';
const FIELD = 'verse_per_line';

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const { getDirectusAdminClient } = await import('../src/lib/directus');
  const client = getDirectusAdminClient();

  const existingFields = await client.request(readFieldsByCollection(COLLECTION));
  if (existingFields.some((f) => f.field === FIELD)) {
    console.info(`${LOG} field "${FIELD}" already exists on "${COLLECTION}" — skipping`);
    return;
  }

  await client.request(
    createField(COLLECTION, {
      field: FIELD,
      type: 'boolean',
      meta: { interface: 'boolean', width: 'half', note: 'Каждый стих с новой строки' },
      schema: { default_value: false, is_nullable: false },
    } as unknown as Parameters<typeof createField>[1]),
  );
  console.info(`${LOG} field "${FIELD}" created on "${COLLECTION}"`);
}

main().catch((err) => {
  console.error(`${LOG} failed:`, err);
  process.exit(1);
});
