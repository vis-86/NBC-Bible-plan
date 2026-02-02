import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal CSV line parser (handles quotes and escaped quotes).
 * Suitable for our small CSV files without external deps.
 */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function parseProverbsField(field) {
  if (!field) return [];

  // Field might contain multiple items separated by commas.
  const parts = field
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const chapters = [];
  for (const part of parts) {
    // Supports: "Прит. 1-2", "Прит. 3", "Прит 4-5", optional spaces
    const m = part.match(/^Прит\.?\s*(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;

    const start = Number.parseInt(m[1], 10);
    const end = m[2] ? Number.parseInt(m[2], 10) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    for (let ch = start; ch <= end; ch++) chapters.push(ch);
  }

  return chapters;
}

async function main() {
  const csvFile = process.argv[2] || path.join(process.cwd(), 'csv', 'csv-plan.csv');

  const raw = await fs.readFile(csvFile, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  /** @type {Map<number, Set<number>>} */
  const weekToChapters = new Map();

  for (const line of lines) {
    const cols = parseCsvLine(line);
    const dayNumber = Number.parseInt((cols[0] || '').trim(), 10);
    if (!Number.isFinite(dayNumber) || dayNumber <= 0) continue;

    const week = Math.min(52, Math.ceil(dayNumber / 7));
    const proverbs = (cols[3] || '').trim();
    if (!proverbs) continue;

    const chapters = parseProverbsField(proverbs);
    if (chapters.length === 0) continue;

    if (!weekToChapters.has(week)) weekToChapters.set(week, new Set());
    const set = weekToChapters.get(week);
    for (const ch of chapters) set.add(ch);
  }

  const items = [];
  let total = 0;

  for (let week = 1; week <= 52; week++) {
    const chapters = Array.from(weekToChapters.get(week) || []).sort((a, b) => a - b);
    let item = 1;
    for (const ch of chapters) {
      items.push({
        numbers: week,
        item,
        read: `Притчи ${ch}`,
      });
      item++;
      total++;
    }
  }

  // Directus-friendly output: JSON array of { numbers, item, read }.
  process.stdout.write(JSON.stringify(items, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

