// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __deleteDB, __resetDBConnection, getDB } from './db';

describe('offline/db getDB', () => {
  beforeEach(async () => {
    // Именно __deleteDB, а не только сброс singleton: незакрытое подключение из
    // прошлого теста блокирует deleteDatabase в следующем (миграционный тест).
    await __deleteDB();
  });

  afterEach(async () => {
    await __deleteDB();
  });

  it('создаёт все ожидаемые object stores при первом открытии', async () => {
    const db = await getDB();
    expect(Array.from(db.objectStoreNames).sort()).toEqual(
      ['apiCache', 'bibleChapters', 'manifest', 'meta', 'outbox', 'songState', 'songs'].sort()
    );
  });

  it('возвращает singleton — повторный вызов не открывает новое подключение', async () => {
    const db1 = await getDB();
    const db2 = await getDB();
    expect(db1).toBe(db2);
  });

  it('позволяет писать и читать запись bibleChapters по составному ключу', async () => {
    const db = await getDB();
    const record = {
      key: 'rst|genesis|1',
      translationId: 'rst',
      book: 'genesis',
      chapter: 1,
      text: 'В начале сотворил Бог...',
      updatedAt: Date.now(),
    };
    await db.put('bibleChapters', record);
    const stored = await db.get('bibleChapters', 'rst|genesis|1');
    expect(stored).toEqual(record);
  });

  it('позволяет читать outbox-записи по индексу by-ts', async () => {
    const db = await getDB();
    await db.put('outbox', { id: 'a', op: 'single', dayIds: [1], count: 3, ts: 100 });
    await db.put('outbox', { id: 'b', op: 'batch', dayIds: [2, 3], count: null, completed: true, ts: 200 });
    const all = await db.getAllFromIndex('outbox', 'by-ts');
    expect(all.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

/**
 * Миграция 1 → 2 (M10, стор `songState`) на УЖЕ УСТАНОВЛЕННОЙ базе.
 *
 * Прошлый тест открывает базу с нуля и поэтому не отличает «добавили стор» от
 * «пересоздали базу»: разница видна только там, где в v1 уже лежат данные. Снос
 * `bibleChapters`/`songs` здесь означал бы, что у каждого установившего PWA
 * пользователя после обновления пропадает скачанное Писание и песни.
 *
 * Имя базы захардкожено намеренно: импорт константы из `db.ts` сделал бы тест
 * слепым ровно к тому, что он проверяет — переименование базы это тоже потеря
 * данных, только через «пользователь открывает пустую новую базу».
 */
describe('offline/db миграция v1 → v2', () => {
  const DB_NAME = 'bible-plan-offline';

  beforeEach(async () => {
    __resetDBConnection();
    await __deleteDB();
  });

  afterEach(async () => {
    await __deleteDB();
  });

  it('добавляет songState, не трогая данные существующих сторов', async () => {
    // Схема v1 — ровно та, что стоит у пользователей до M10.
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const chapters = db.createObjectStore('bibleChapters', { keyPath: 'key' });
        chapters.createIndex('by-translation', 'translationId');
        db.createObjectStore('songs', { keyPath: 'id' });
        db.createObjectStore('apiCache', { keyPath: 'key' });
        const outbox = db.createObjectStore('outbox', { keyPath: 'id' });
        outbox.createIndex('by-ts', 'ts');
        db.createObjectStore('meta', { keyPath: 'key' });
        db.createObjectStore('manifest', { keyPath: 'key' });
      },
    });
    await v1.put('bibleChapters', {
      key: 'rst|Бытие|1',
      translationId: 'rst',
      book: 'Бытие',
      chapter: 1,
      text: 'В начале сотворил Бог...',
      updatedAt: 1,
    });
    await v1.put('songs', { id: '42', data: { title: 'Песня' }, updatedAt: 1 });
    // Запись прогресса БЕЗ `kind` — их у пользователей полно, и после апдейта они
    // обязаны и уцелеть, и продолжить читаться как прогресс.
    await v1.put('outbox', { id: 'legacy', op: 'single', dayIds: [7], count: 2, ts: 100 });
    await v1.put('manifest', { key: 'songs', downloadedAt: 1, itemCount: 97 });
    v1.close();

    const db = await getDB();

    expect(db.version).toBe(2);
    expect(db.objectStoreNames).toContain('songState');
    expect(await db.get('bibleChapters', 'rst|Бытие|1')).toMatchObject({ text: 'В начале сотворил Бог...' });
    expect(await db.get('songs', '42')).toMatchObject({ data: { title: 'Песня' } });
    expect(await db.get('outbox', 'legacy')).toMatchObject({ op: 'single', dayIds: [7] });
    expect(await db.get('manifest', 'songs')).toMatchObject({ itemCount: 97 });
    // Индекс by-ts переживает миграцию — без него replay-движок читает пустую очередь.
    expect((await db.getAllFromIndex('outbox', 'by-ts')).map((r) => r.id)).toEqual(['legacy']);
  });
});
