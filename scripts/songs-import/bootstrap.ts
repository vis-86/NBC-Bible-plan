#!/usr/bin/env npx tsx
/**
 * Idempotent bootstrap Directus-коллекции `songs`.
 *
 * Создаёт коллекцию и поля, если их ещё нет. Безопасно запускать повторно —
 * существующие коллекция/поля пропускаются.
 *
 * Запуск: `npm run songs:bootstrap`
 * Требует env (из .env.local): NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN.
 *
 * ПРИМЕЧАНИЕ: createCollection/createField не имеют прецедента в репо (в проде
 * коллекции обычно заводят через Admin UI). Payload сверен с @directus/sdk v20.
 * tsx не резолвит `@/`, поэтому импорт клиента — относительным путём.
 */
import { loadEnvConfig } from '@next/env';
import { createCollection, createField, readCollections, readFieldsByCollection } from '@directus/sdk';

const LOG = '[songs:bootstrap]';
export const SONGS_COLLECTION = 'songs';

/** Явные payload'ы полей (кроме первичного ключа `id`, он заводится с коллекцией). */
const FIELD_SPECS = [
  { field: 'title', type: 'string', meta: { interface: 'input', required: true, width: 'full' }, schema: { is_nullable: false } },
  { field: 'subtitle', type: 'string', meta: { interface: 'input', width: 'full' }, schema: { is_nullable: true } },
  { field: 'song_key', type: 'string', meta: { interface: 'input', width: 'half', note: 'Тональность (директива {key})' }, schema: { is_nullable: true } },
  { field: 'tempo', type: 'integer', meta: { interface: 'input', width: 'half' }, schema: { is_nullable: true } },
  { field: 'time', type: 'string', meta: { interface: 'input', width: 'half' }, schema: { is_nullable: true } },
  { field: 'content', type: 'text', meta: { interface: 'input-multiline', required: true, width: 'full', note: 'Сырой ChordPro' }, schema: { is_nullable: false } },
  { field: 'slug', type: 'string', meta: { interface: 'input', width: 'full', note: 'Стабильный slug из имени файла (unique)' }, schema: { is_nullable: false, is_unique: true } },
  {
    field: 'status',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      width: 'half',
      options: { choices: [{ text: 'Published', value: 'published' }, { text: 'Draft', value: 'draft' }] },
    },
    schema: { default_value: 'published' },
  },
  { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true, width: 'half' }, schema: { is_nullable: true } },
  { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {} },
  { field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: {} },
] as const;

async function main(): Promise<void> {
  // Грузим .env.local до создания клиента (getDirectusAdminClient читает env в момент вызова).
  loadEnvConfig(process.cwd());

  const { getDirectusAdminClient } = await import('../../src/lib/directus');
  const client = getDirectusAdminClient();

  // 1) Коллекция.
  const collections = await client.request(readCollections());
  const collectionExists = collections.some((c) => c.collection === SONGS_COLLECTION);

  if (collectionExists) {
    console.info(`${LOG} collection "${SONGS_COLLECTION}" already exists — skipping create`);
  } else {
    await client.request(
      createCollection({
        collection: SONGS_COLLECTION,
        meta: { icon: 'music_note', note: 'ChordPro song catalog', sort_field: 'sort', display_template: '{{title}}' },
        schema: { name: SONGS_COLLECTION },
        // PK заводится вместе с коллекцией: integer, auto-increment.
        fields: [
          {
            field: 'id',
            type: 'integer',
            meta: { hidden: true },
            schema: { is_primary_key: true, has_auto_increment: true },
          },
        ],
      }),
    );
    console.info(`${LOG} collection "${SONGS_COLLECTION}" created`);
  }

  // 2) Поля (идемпотентно: создаём только отсутствующие).
  const existingFields = await client.request(readFieldsByCollection(SONGS_COLLECTION));
  const existingNames = new Set(existingFields.map((f) => f.field));

  let created = 0;
  for (const spec of FIELD_SPECS) {
    if (existingNames.has(spec.field)) {
      console.info(`${LOG} field "${spec.field}" already exists — skipping`);
      continue;
    }
    try {
      // Тип SDK для meta/schema — NestedPartial; наши payload'ы совместимы.
      await client.request(createField(SONGS_COLLECTION, spec as unknown as Parameters<typeof createField>[1]));
      created++;
      console.info(`${LOG} field "${spec.field}" created`);
    } catch (err) {
      console.error(`${LOG} failed to create field "${spec.field}":`, err);
      throw err;
    }
  }

  console.info(`${LOG} done — collection ready, ${created} field(s) created, ${FIELD_SPECS.length - created} already present`);
}

main().catch((err) => {
  console.error(`${LOG} bootstrap failed:`, err);
  process.exit(1);
});
