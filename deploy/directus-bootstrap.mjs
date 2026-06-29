#!/usr/bin/env node
/**
 * Recreate the Directus data model for NBC Bible Plan on a fresh instance.
 * Source of truth: src/lib/directus-schema.ts + docs/database-schema.md.
 * Idempotent: skips collections that already exist.
 *
 * Env:
 *   DIRECTUS_URL (or NEXT_PUBLIC_DIRECTUS_URL)  default http://directus:8055
 *   DIRECTUS_ADMIN_TOKEN  (required)
 *
 * Run (inside compose network):
 *   docker run --rm --network nbc-bible_internal \
 *     -e DIRECTUS_URL=http://directus:8055 -e DIRECTUS_ADMIN_TOKEN=xxx \
 *     -v /opt/nbc/bible-plan/deploy:/w -w /w node:22-slim node directus-bootstrap.mjs
 */

const base = (process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://directus:8055').replace(/\/$/, '');
const token = process.env.DIRECTUS_ADMIN_TOKEN;
if (!token) {
  console.error('DIRECTUS_ADMIN_TOKEN is required');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function api(path, options = {}) {
  const res = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${options.method || 'GET'} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const pk = (auto = true) => ({
  field: 'id',
  type: 'integer',
  meta: { hidden: true, interface: 'input', readonly: true },
  schema: { is_primary_key: true, has_auto_increment: auto },
});
const uuidPk = () => ({
  field: 'id',
  type: 'uuid',
  meta: { hidden: true, interface: 'input', readonly: true, special: ['uuid'] },
  schema: { is_primary_key: true },
});
const f = (field, type, extra = {}) => ({ field, type, meta: {}, schema: { is_nullable: true, ...extra } });

const collections = [
  {
    collection: 'plan',
    fields: [pk(), f('numbers', 'integer'), f('day', 'string'), f('read', 'string'), f('item', 'integer')],
  },
  {
    collection: 'reading',
    fields: [
      pk(),
      f('user_id', 'integer'),
      f('day', 'integer'),
      f('directus_user_id', 'string'),
      f('count', 'integer'),
      { field: 'completed_items', type: 'json', meta: { interface: 'input-code', options: { language: 'json' } }, schema: { is_nullable: true } },
      f('year', 'integer'),
    ],
  },
  {
    collection: 'weekly_plan',
    fields: [pk(), f('numbers', 'integer'), f('item', 'integer'), f('read', 'string'), f('sort_key', 'integer')],
  },
  {
    collection: 'weeks',
    fields: [pk(), f('num_1', 'integer'), f('num_2', 'integer'), f('num_3', 'integer'), f('num_4', 'integer'), f('num_5', 'integer'), f('num_6', 'integer'), f('num_7', 'integer')],
  },
  {
    collection: 'telegram_user_mapping',
    fields: [pk(), f('directus_user_id', 'string'), { field: 'telegram_user_id', type: 'integer', meta: {}, schema: { is_nullable: false, is_unique: true } }],
  },
  {
    collection: 'reading_settings',
    fields: [
      pk(),
      f('directus_user_id', 'string'),
      f('font_size', 'integer'),
      f('line_height', 'float'),
      f('text_align', 'string'),
      f('theme', 'string'),
      f('verse_numbers_visible', 'boolean'),
    ],
  },
  {
    collection: 'user_app_settings',
    fields: [uuidPk(), f('directus_user_id', 'string'), f('theme', 'string')],
  },
];

async function exists(name) {
  try { await api(`/collections/${name}`); return true; } catch { return false; }
}

async function main() {
  console.log('Directus:', base);
  const me = await api('/users/me?fields=email,role.name');
  console.log('Authenticated as:', me.data?.email);

  for (const c of collections) {
    if (await exists(c.collection)) {
      console.log(`= ${c.collection} already exists, skipping`);
      continue;
    }
    await api('/collections', {
      method: 'POST',
      body: JSON.stringify({ collection: c.collection, fields: c.fields, schema: {}, meta: { note: 'NBC Bible Plan' } }),
    });
    console.log(`+ created ${c.collection} (${c.fields.length} fields)`);
  }

  const all = await api('/collections?limit=-1');
  const names = (all.data || []).map((x) => x.collection).filter((n) => !n.startsWith('directus_')).sort();
  console.log('\nUser collections now:', names.join(', '));
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
