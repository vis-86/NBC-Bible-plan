#!/usr/bin/env node
/**
 * Fix malformed John-epistle entries in the daily `plan`.
 * Import left two days with multiple single-chapter epistles merged into one
 * unparseable `read` value:
 *   day 87:  "2Ин., 3Ин"  -> must be "2Ин." + "3Ин."
 *   day 297: "2-3Ин.,"    -> must be "2Ин." + "3Ин."
 * These don't map to a book and won't open in the reader.
 *
 * Idempotent: rebuilds each target day's items from the desired list.
 * `reading` progress references day `numbers` (not plan ids), so rebuilding
 * a day's plan rows is safe.
 *
 * Env: DIRECTUS_URL (default http://directus:8055), DIRECTUS_ADMIN_TOKEN
 */
const base = (process.env.DIRECTUS_URL || 'http://directus:8055').replace(/\/$/, '');
const token = process.env.DIRECTUS_ADMIN_TOKEN;
if (!token) { console.error('DIRECTUS_ADMIN_TOKEN required'); process.exit(1); }
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
async function api(path, opts = {}) {
  const res = await fetch(`${base}${path}`, { ...opts, headers: { ...h, ...opts.headers } });
  const t = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${opts.method || 'GET'} ${path}: ${t}`);
  return t ? JSON.parse(t) : null;
}

// Desired ordered chapter list per affected day (John epistles split out,
// psalms preserved exactly as imported).
const targets = {
  87:  ['2Ин.', '3Ин.', 'Пс. 34', 'Пс. 35'],
  297: ['2Ин.', '3Ин.', 'Пс. 138'],
};

(async () => {
  for (const [numbersStr, reads] of Object.entries(targets)) {
    const numbers = Number(numbersStr);
    const f = encodeURIComponent(JSON.stringify({ numbers: { _eq: numbers } }));
    const cur = (await api(`/items/plan?filter=${f}&sort[]=item&fields=id,day,read,item`)).data;
    if (!cur.length) { console.log(`day ${numbers}: no items, skip`); continue; }
    const day = cur[0].day;

    // Already correct? (same reads in same order)
    const curReads = cur.sort((a, b) => a.item - b.item).map((r) => r.read);
    if (JSON.stringify(curReads) === JSON.stringify(reads)) {
      console.log(`day ${numbers}: already correct, skip`);
      continue;
    }

    // Rebuild: delete current rows, recreate from desired list
    await api('/items/plan', { method: 'DELETE', body: JSON.stringify(cur.map((r) => r.id)) });
    const payload = reads.map((read, i) => ({ numbers, day, read, item: i + 1 }));
    await api('/items/plan', { method: 'POST', body: JSON.stringify(payload) });
    console.log(`day ${numbers}: rebuilt ${cur.length} -> ${reads.length} items: ${reads.join(', ')}`);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
