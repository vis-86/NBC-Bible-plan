#!/usr/bin/env npx tsx
/**
 * Idempotent: добавляет поля `ot_translation`/`nt_translation` (string, default 'rst') в
 * существующую Directus-коллекцию `reading_settings`.
 *
 * Отсутствие этих полей в схеме — причина бага «смена перевода не обновляет текст»:
 * Directus молча отбрасывает неизвестные поля при updateItem, поэтому сохранение
 * перевода было no-op, и сервер всегда резолвил дефолтный 'rst' (см. .ai-factory/PLAN.md).
 *
 * Запуск: `npx tsx scripts/add-translation-fields.ts`
 * Требует env (из .env.local): NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN.
 * На проде — тот же скрипт, тем же способом: прод-admin-токен ротируется при
 * пересборке — брать актуальный из окружения сервера.
 */
import { loadEnvConfig } from '@next/env';
import { createField, readFieldsByCollection } from '@directus/sdk';

const LOG = '[add-translation-fields]';
const COLLECTION = 'reading_settings';
const FIELDS = ['ot_translation', 'nt_translation'] as const;

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const { getDirectusAdminClient } = await import('../src/lib/directus');
  const client = getDirectusAdminClient();

  const existingFields = await client.request(readFieldsByCollection(COLLECTION));
  const existingNames = new Set(existingFields.map((f) => f.field));

  for (const field of FIELDS) {
    if (existingNames.has(field)) {
      console.info(`${LOG} field "${field}" already exists on "${COLLECTION}" — skipping`);
      continue;
    }

    await client.request(
      createField(COLLECTION, {
        field,
        type: 'string',
        meta: {
          interface: 'input',
          width: 'half',
          note: field === 'ot_translation' ? 'Перевод Ветхого Завета' : 'Перевод Нового Завета',
        },
        schema: { default_value: 'rst', is_nullable: false },
      } as unknown as Parameters<typeof createField>[1]),
    );
    console.info(`${LOG} field "${field}" created on "${COLLECTION}"`);
  }
}

main().catch((err) => {
  console.error(`${LOG} failed:`, err);
  process.exit(1);
});
