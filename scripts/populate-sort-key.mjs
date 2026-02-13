#!/usr/bin/env node
/**
 * One-time script: fill sort_key for plan and weekly_plan.
 * sort_key = numbers * 10000 + item
 * Requires .env.local with DIRECTUS_ADMIN_TOKEN and NEXT_PUBLIC_DIRECTUS_URL.
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
  console.error('Set DIRECTUS_ADMIN_TOKEN in .env.local and run: node scripts/populate-sort-key.mjs');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

async function fetchJson(path, options = {}) {
  const res = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  return res.json();
}

function sortKey(numbers, item) {
  return (Number(numbers) || 0) * 10000 + (Number(item) || 0);
}

const BATCH = 100;

async function updateCollection(collection, pk) {
  const data = await fetchJson(`/items/${collection}?fields=id,numbers,item&limit=-1`);
  const items = Array.isArray(data.data) ? data.data : data;
  if (!items.length) {
    console.log(collection, 'no items');
    return;
  }
  const updates = items.map((r) => ({
    [pk]: r[pk] ?? r.id,
    sort_key: sortKey(r.numbers, r.item),
  }));
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await fetchJson(`/items/${collection}`, {
      method: 'PATCH',
      body: JSON.stringify(batch),
    });
    console.log(collection, `updated ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
  }
}

async function main() {
  await updateCollection('plan', 'id');
  await updateCollection('weekly_plan', 'id');
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
