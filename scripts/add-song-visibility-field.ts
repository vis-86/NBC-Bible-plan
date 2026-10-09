#!/usr/bin/env npx tsx
/**
 * Idempotent: добавляет `songs.visibility` (string, NOT NULL, default 'public') — кому
 * открыта песня по ссылке «Поделиться» (`/s?id=`): `public` — всем, `members` — только
 * вошедшим. Существующие строки получают дефолт колонки, то есть открываются всем.
 *
 * Без поля BFF ломается в обе стороны: публичный эндпоинт фильтрует по нему (Directus
 * ответит ошибкой на фильтр по неизвестному полю → 500), а запись из редактора молча
 * отбросит значение. Применять ДО деплоя кода.
 *
 * Запуск: `npx tsx scripts/add-song-visibility-field.ts`
 * Требует env (из .env.local): NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN.
 * На проде — тот же скрипт: прод-admin-токен ротируется при пересборке — брать
 * актуальный из окружения сервера.
 */
import { loadEnvConfig } from '@next/env';
import { createField, readFieldsByCollection } from '@directus/sdk';

const LOG = '[add-song-visibility-field]';
const COLLECTION = 'songs';
const FIELD = 'visibility';

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
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        width: 'half',
        note: 'Кому открыта песня по ссылке «Поделиться»',
        options: {
          choices: [
            { text: 'Всем по ссылке', value: 'public' },
            { text: 'Только участникам', value: 'members' },
          ],
        },
      },
      schema: { default_value: 'public', is_nullable: false },
    } as unknown as Parameters<typeof createField>[1]),
  );
  console.info(`${LOG} field "${FIELD}" created on "${COLLECTION}"`);
}

main().catch((err) => {
  console.error(`${LOG} failed:`, err);
  process.exit(1);
});
