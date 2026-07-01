#!/usr/bin/env npx tsx
// @ts-nocheck - Directus SDK typing issue with custom schema (см. src/lib/directus-data.ts):
// коллекции в DirectusSchema типизированы объектами (не массивами), из-за чего SDK v20
// считает их singleton'ами и сужает collection-параметр readItems/createItem/updateItem до never.
/**
 * Импорт песен ChordPro в Directus-коллекцию `songs`.
 *
 * Читает `data/songs/*.chordpro`, парсит ported-парсером и upsert'ит по `slug`
 * (идемпотентно: повторный запуск обновляет существующие, не плодит дубли).
 *
 * Запуск: `npm run songs:import` (предварительно `npm run songs:bootstrap`).
 * Требует env (.env.local): NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN.
 *
 * tsx НЕ резолвит `@/` — парсер импортируется относительным путём (как bible-import).
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { createItem, readItems, updateItem } from '@directus/sdk';
import { parseChordProFile } from '../../src/features/songs/lib/chordProParser';

const LOG = '[songs:import]';
const SONGS_DIR = path.resolve(process.cwd(), 'data/songs');

/** Directus-запись песни (без служебных полей). */
interface SongUpsert {
  title: string;
  subtitle: string | null;
  song_key: string | null;
  tempo: number | null;
  time: string | null;
  content: string;
  slug: string;
  sort: number | null;
}

/** slug из имени файла: "75-я-живу-христом.chordpro" → "75-я-живу-христом". */
function slugFromFilename(filename: string): string {
  return filename.replace(/\.chordpro$/i, '');
}

/** tempo из строки метаданных → integer или null (поле Directus — integer). */
function parseTempo(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.match(/\d+/);
  return m ? Number(m[0]) : null;
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  if (!fs.existsSync(SONGS_DIR)) {
    console.error(`${LOG} directory not found: ${SONGS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(SONGS_DIR).filter((f) => f.toLowerCase().endsWith('.chordpro')).sort();
  console.info(`${LOG} found ${files.length} .chordpro file(s) in ${SONGS_DIR}`);

  const { getDirectusAdminClient } = await import('../../src/lib/directus');
  const client = getDirectusAdminClient();

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const filename of files) {
    try {
      const raw = fs.readFileSync(path.join(SONGS_DIR, filename), 'utf-8');
      const parsed = parseChordProFile(raw, filename);

      if (!parsed.content.trim()) {
        console.warn(`${LOG} WARN empty content, skipping: ${filename}`);
        failed++;
        continue;
      }

      const slug = slugFromFilename(filename);
      const numericId = /^\d+$/.test(parsed.id) ? Number(parsed.id) : null;
      const record: SongUpsert = {
        title: parsed.metadata.title || 'Без названия',
        subtitle: parsed.metadata.subtitle || parsed.metadata.artist || null,
        song_key: parsed.metadata.key || null,
        tempo: parseTempo(parsed.metadata.tempo),
        time: parsed.metadata.time || null,
        content: parsed.content,
        slug,
        sort: numericId,
      };

      // Upsert по slug.
      const existing = await client.request(
        readItems('songs', { filter: { slug: { _eq: slug } }, limit: 1 }),
      );

      if (existing.length > 0) {
        await client.request(updateItem('songs', existing[0].id, record));
        updated++;
        console.info(`${LOG} updated: ${slug}`);
      } else {
        await client.request(createItem('songs', record));
        created++;
        console.info(`${LOG} created: ${slug}`);
      }
    } catch (err) {
      failed++;
      console.error(`${LOG} ERROR importing "${filename}":`, err);
    }
  }

  console.info(`${LOG} done — created: ${created}, updated: ${updated}, failed/skipped: ${failed}, total: ${files.length}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`${LOG} import failed:`, err);
  process.exit(1);
});
