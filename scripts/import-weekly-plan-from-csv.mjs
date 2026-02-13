#!/usr/bin/env node
/**
 * Sync weekly plan from CSV to Directus collection weekly_plan.
 * Replaces all items where read starts with "Притчи" with rows from the CSV.
 * Requires .env.local with DIRECTUS_ADMIN_TOKEN and NEXT_PUBLIC_DIRECTUS_URL.
 *
 * Usage: node scripts/import-weekly-plan-from-csv.mjs [path/to/file.csv]
 * Default CSV: csv/bible_plan_2026_weekly_final.csv
 *
 * After import you may run: node scripts/populate-sort-key.mjs
 * to fill sort_key for weekly_plan (if that field is used).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
try {
  const content = readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
} catch {
  // .env.local optional if vars set otherwise
}

const base = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055';
const token = process.env.DIRECTUS_ADMIN_TOKEN;
if (!token) {
  console.error('Set DIRECTUS_ADMIN_TOKEN in .env.local and run: node scripts/import-weekly-plan-from-csv.mjs');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

async function fetchJson(path, options = {}) {
  const url = path.startsWith('http') ? path : `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function parseCsv(csvPath) {
  const absolutePath = resolve(process.cwd(), csvPath);
  const content = readFileSync(absolutePath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const delimiter = line.includes(';') ? ';' : ',';
    const parts = line.split(delimiter).map((p) => p.trim());
    if (parts.length < 3) continue;
    const numbers = parseInt(parts[0], 10);
    const item = parseInt(parts[1], 10);
    const read = parts[2];
    if (i === 0 && (parts[0] === 'numbers' || isNaN(numbers))) continue; // skip header
    if (isNaN(numbers) || isNaN(item) || !read) continue;
    rows.push({ numbers, item, read });
  }
  return rows;
}

const BATCH = 50;

async function main() {
  const csvPath = process.argv[2] || 'csv/bible_plan_2026_weekly_final.csv';
  const rows = parseCsv(csvPath);
  if (!rows.length) {
    console.error('No rows parsed from', csvPath);
    process.exit(1);
  }
  console.log('Parsed', rows.length, 'rows from', csvPath);

  // Fetch existing "Притчи" ids
  const filter = encodeURIComponent(JSON.stringify({ read: { _starts_with: 'Притчи' } }));
  const listRes = await fetchJson(`/items/weekly_plan?fields=id&limit=-1&filter=${filter}`);
  const existing = Array.isArray(listRes.data) ? listRes.data : listRes;
  const ids = existing.map((r) => r.id).filter(Boolean);

  if (ids.length > 0) {
    await fetchJson('/items/weekly_plan', {
      method: 'DELETE',
      body: JSON.stringify(ids),
    });
    console.log('Deleted', ids.length, 'existing items (read starts with "Притчи")');
  } else {
    console.log('No existing "Притчи" items to delete');
  }

  let created = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    // Directus bulk create: body is array of items (no "data" wrapper in some versions)
    await fetchJson('/items/weekly_plan', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
    created += batch.length;
    console.log('Created', created, '/', rows.length);
  }

  console.log('Done. Created', created, 'items.');
  console.log('Optional: run node scripts/populate-sort-key.mjs to fill sort_key for weekly_plan.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
