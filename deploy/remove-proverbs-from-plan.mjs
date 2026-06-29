#!/usr/bin/env node
/**
 * Remove the book of Proverbs (Прит*) from the daily `plan` collection.
 * Proverbs is now read via the weekly plan (weekly_plan), so daily plan
 * must not contain "Прит. N" entries. After deletion, re-sequence `item`
 * within each affected day so numbering stays contiguous (1..N).
 *
 * Env: DIRECTUS_URL (default http://directus:8055), DIRECTUS_ADMIN_TOKEN
 * Safe to re-run (idempotent: nothing to delete on a clean plan).
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
const isProverbs = (read) => typeof read === 'string' && /^Прит/i.test(read.trim());

(async () => {
  const all = (await api('/items/plan?limit=-1&fields=id,numbers,item,read&sort[]=numbers&sort[]=item')).data;
  console.log('plan total before:', all.length);

  const proverbs = all.filter((r) => isProverbs(r.read));
  console.log('proverbs rows to delete:', proverbs.length);
  if (proverbs.length === 0) { console.log('nothing to delete — already clean'); return; }

  const delIds = proverbs.map((r) => r.id);
  for (let i = 0; i < delIds.length; i += 50) {
    await api('/items/plan', { method: 'DELETE', body: JSON.stringify(delIds.slice(i, i + 50)) });
  }
  console.log('deleted', delIds.length, 'proverbs rows');

  // Re-sequence item within each affected day
  const affectedDays = [...new Set(proverbs.map((r) => r.numbers))];
  const delSet = new Set(delIds);
  let patched = 0;
  for (const numbers of affectedDays) {
    const remaining = all
      .filter((r) => r.numbers === numbers && !delSet.has(r.id))
      .sort((a, b) => a.item - b.item);
    let next = 1;
    for (const r of remaining) {
      if (r.item !== next) {
        await api(`/items/plan/${r.id}`, { method: 'PATCH', body: JSON.stringify({ item: next }) });
        patched++;
      }
      next++;
    }
  }
  console.log('re-sequenced items:', patched, 'across', affectedDays.length, 'days');

  const after = (await api('/items/plan?limit=0&meta=total_count')).meta.total_count;
  const stillProverbs = (await api(`/items/plan?limit=1&fields=id&filter=${encodeURIComponent(JSON.stringify({ read: { _starts_with: 'Прит' } }))}`)).data.length;
  console.log('plan total after:', after, '| remaining proverbs:', stillProverbs);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
