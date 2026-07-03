import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * IndexedDB-слой офлайн-режима. Единая точка входа для всех offline-модулей
 * (readThrough, sync, downloadManager) — см. .ai-factory/plans/feature-offline-pwa.md.
 *
 * Версия схемы задана с первого дня через `upgrade`-колбэк: первое живое изменение
 * схемы без миграции = потеря данных/сломанное приложение у уже установивших PWA юзеров.
 */

const DB_NAME = 'bible-plan-offline';
const DB_VERSION = 1;

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[offline/db]', ...args);
}

/** Ключ текста главы Писания в IDB — `${translationId}|${book}|${chapter}`. */
export interface BibleChapterRecord {
  key: string;
  translationId: string;
  book: string;
  chapter: number;
  text: string;
  updatedAt: number;
}

export interface SongRecord {
  /** Совпадает с `Song.id` (строка — числовой id из имени chordpro-файла). */
  id: string;
  data: unknown;
  updatedAt: number;
}

/** Снимок сетевого GET-ответа для read-through фолбэка (Task 31). */
export interface ApiCacheRecord {
  key: string;
  data: unknown;
  updatedAt: number;
}

/** Мутация прогресса, ожидающая подтверждения сервера (write-ahead outbox, Task 25). */
export interface OutboxRecord {
  id: string;
  op: 'single' | 'batch';
  dayIds: number[];
  count: number | null;
  completedItems?: number[];
  completed?: boolean;
  ts: number;
}

/** Произвольные единичные значения: last-known-user, версия схемы и т.п. */
export interface MetaRecord {
  key: string;
  value: unknown;
}

/** Манифест скачанного офлайн-контента (для UI секции настроек, Task 27/30). */
export interface ManifestRecord {
  key: string;
  downloadedAt: number;
  sizeBytes?: number;
  itemCount?: number;
}

interface OfflineDBSchema extends DBSchema {
  bibleChapters: {
    key: string;
    value: BibleChapterRecord;
    indexes: { 'by-translation': string };
  };
  songs: {
    key: string;
    value: SongRecord;
  };
  apiCache: {
    key: string;
    value: ApiCacheRecord;
  };
  outbox: {
    key: string;
    value: OutboxRecord;
    indexes: { 'by-ts': number };
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
  manifest: {
    key: string;
    value: ManifestRecord;
  };
}

export type OfflineDB = IDBPDatabase<OfflineDBSchema>;

let dbPromise: Promise<OfflineDB> | undefined;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

/**
 * Возвращает singleton-подключение к офлайн-БД. На сервере (SSR) — throw, вызывать
 * только из клиентского кода.
 */
export function getDB(): Promise<OfflineDB> {
  if (!isBrowser()) {
    return Promise.reject(new Error('[offline/db] getDB() must be called in the browser'));
  }

  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        debug('upgrade', { oldVersion, newVersion });

        if (!db.objectStoreNames.contains('bibleChapters')) {
          const store = db.createObjectStore('bibleChapters', { keyPath: 'key' });
          store.createIndex('by-translation', 'translationId');
        }
        if (!db.objectStoreNames.contains('songs')) {
          db.createObjectStore('songs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('apiCache')) {
          db.createObjectStore('apiCache', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', { keyPath: 'id' });
          store.createIndex('by-ts', 'ts');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('manifest')) {
          db.createObjectStore('manifest', { keyPath: 'key' });
        }
      },
      blocked() {
        debug('upgrade blocked by another open tab');
      },
      blocking() {
        debug('blocking another tab\'s upgrade — closing');
        dbPromise = undefined;
      },
      terminated() {
        debug('connection terminated unexpectedly');
        dbPromise = undefined;
      },
    });
  }

  return dbPromise;
}

/** Только для тестов: сбросить singleton-подключение. */
export function __resetDBConnection(): void {
  dbPromise = undefined;
}

/** Только для тестов: полностью удалить БД (изоляция между тестами на fake-indexeddb). */
export async function __deleteDB(): Promise<void> {
  const pending = dbPromise;
  dbPromise = undefined;
  if (!isBrowser()) return;

  // Открытое соединение из предыдущего теста блокирует deleteDatabase() без onblocked
  // в fake-indexeddb — закрываем явно перед удалением.
  if (pending) {
    try {
      (await pending).close();
    } catch {
      // соединение уже закрыто/недействительно — не мешает удалению
    }
  }

  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
