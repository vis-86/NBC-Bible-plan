/**
 * T4.1 плана M9: одноразовая миграция якорей ink-пометок в `song_user_state`.
 *
 * Каждому штриху без `anchor.hash` дописывается хэш строки на его позиции в ТЕКУЩЕМ
 * `songs.content`. Корректно ровно до первой правки песни в редакторе — поэтому запуск
 * ДО деплоя UI правки песен. Пересказ решения и рисков — `.ai-factory/plans/feature-song-editor.md`.
 *
 * Запуск (по умолчанию — вхолостую, только отчёт):
 *   node --env-file=.env.local --import tsx scripts/migrate-ink-anchor-hashes.ts
 *   node --env-file=.env.local --import tsx scripts/migrate-ink-anchor-hashes.ts --apply
 *
 * Пишется ТОЛЬКО поле `strokes`; `updated_at` не трогается намеренно. Клиент применяет
 * ответ сервера, если локальная копия не строго новее (`songAnnotationsStore`): устройства
 * с той же меткой примут версию с хэшами, а более свежая офлайн-правка из outbox по-прежнему
 * выиграет. Подними миграция `updated_at` — эта правка отбилась бы как устаревшая.
 *
 * Перед записью строка перечитывается: если пользователь успел сохранить пометки после
 * чтения, строка пропускается, а не затирается.
 *
 * В вывод идут только числа и id песен — без id пользователей и содержимого пометок.
 */
import { readItem, readItems, updateItem, type DirectusClient, type RestClient } from '@directus/sdk';
import { getDirectusAdminClient } from '../src/lib/directus';
import { addMissingAnchorHashes, buildLineHashIndex } from '../src/features/songs/lib/inkLineHash';
import type { SongStroke } from '../src/features/songs/types';

const LOG = '[migrate-ink-anchor-hashes]';

interface StateRow {
  id: string;
  song: number;
  strokes: SongStroke[] | null;
  updated_at: string | null;
}

interface SongRow {
  id: number;
  content: string | null;
}

/** Локальная схема: общая `DirectusSchema` описывает коллекции объектами (см. songStateServer). */
interface MigrationSchema {
  song_user_state: StateRow[];
  songs: SongRow[];
}

type Client = DirectusClient<MigrationSchema> & RestClient<MigrationSchema>;

interface PlannedUpdate {
  row: StateRow;
  strokes: SongStroke[];
  added: number;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const client = getDirectusAdminClient() as unknown as Client;
  console.info(`${LOG} mode: ${apply ? 'APPLY (writes to Directus)' : 'dry run (read-only)'}`);

  const songs = await client.request(readItems('songs', { fields: ['id', 'content'], limit: -1 }));
  const contentById = new Map(songs.map((s) => [Number(s.id), s.content ?? '']));
  const rows = await client.request(
    readItems('song_user_state', { fields: ['id', 'song', 'strokes', 'updated_at'], limit: -1 })
  );

  const totals = { rows: rows.length, rowsWithStrokes: 0, songMissing: 0, added: 0, alreadyHashed: 0, noLine: 0 };
  const perSong = new Map<number, { rows: number; added: number }>();
  const planned: PlannedUpdate[] = [];

  for (const row of rows) {
    const strokes = Array.isArray(row.strokes) ? row.strokes : [];
    if (strokes.length === 0) continue;
    totals.rowsWithStrokes++;

    const content = contentById.get(Number(row.song));
    if (content === undefined) {
      totals.songMissing++;
      continue;
    }

    const result = addMissingAnchorHashes(strokes, buildLineHashIndex(content));
    totals.added += result.added;
    totals.alreadyHashed += result.alreadyHashed;
    totals.noLine += result.noLine;
    if (result.added === 0) continue;

    planned.push({ row, strokes: result.strokes, added: result.added });
    const song = perSong.get(Number(row.song)) ?? { rows: 0, added: 0 };
    perSong.set(Number(row.song), { rows: song.rows + 1, added: song.added + result.added });
  }

  console.info(`${LOG} songs in catalog: ${songs.length}`);
  console.info(`${LOG} song_user_state rows: ${totals.rows}, with strokes: ${totals.rowsWithStrokes}`);
  console.info(`${LOG} strokes: to hash ${totals.added}, already hashed ${totals.alreadyHashed}, no line at their position ${totals.noLine}`);
  console.info(`${LOG} rows to update: ${planned.length}; rows whose song is gone: ${totals.songMissing}`);
  for (const [songId, s] of [...perSong.entries()].sort((a, b) => a[0] - b[0])) {
    console.info(`${LOG}   song ${songId}: ${s.rows} row(s), ${s.added} stroke(s) to hash`);
  }

  if (!apply) {
    console.info(`${LOG} dry run — nothing written. Re-run with --apply to write.`);
    return;
  }

  let written = 0;
  let skippedChanged = 0;
  let failed = 0;
  for (const { row, strokes } of planned) {
    try {
      const fresh = await client.request(readItem('song_user_state', row.id, { fields: ['strokes', 'updated_at'] }));
      if (fresh.updated_at !== row.updated_at || JSON.stringify(fresh.strokes) !== JSON.stringify(row.strokes)) {
        skippedChanged++;
        continue;
      }
      await client.request(updateItem('song_user_state', row.id, { strokes }));
      written++;
    } catch (error) {
      failed++;
      console.error(`${LOG} update failed for song ${row.song}:`, error instanceof Error ? error.message : error);
    }
  }
  console.info(`${LOG} written: ${written}, skipped (changed during migration): ${skippedChanged}, failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`${LOG} migration failed:`, error instanceof Error ? error.message : error);
  process.exit(1);
});
