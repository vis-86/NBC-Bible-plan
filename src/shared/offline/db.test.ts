// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetDBConnection, getDB } from './db';

describe('offline/db getDB', () => {
  beforeEach(() => {
    __resetDBConnection();
  });

  afterEach(() => {
    __resetDBConnection();
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
