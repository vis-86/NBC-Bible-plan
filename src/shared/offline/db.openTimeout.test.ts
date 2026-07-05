// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Мокаем idb ЦЕЛИКОМ: воспроизводим iOS WebKit-баг, когда indexedDB.open()
// после холодного старта PWA вечно молчит (события не приходят до reload).
vi.mock('idb', () => ({
  openDB: vi.fn(() => new Promise(() => {})),
}));

import { openDB } from 'idb';
import { getDB, __resetDBConnection } from './db';

describe('getDB: зависшее открытие IndexedDB (iOS WebKit)', () => {
  afterEach(() => {
    vi.useRealTimers();
    __resetDBConnection();
  });

  it('reject по таймауту вместо вечного pending + сброс singleton для ретрая', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const first = getDB();
    const rejection = expect(first).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(5001);
    await rejection;

    // Singleton сброшен — следующий вызов пробует открыть БД заново, а не
    // возвращает навсегда отклонённый promise.
    void getDB().catch(() => {});
    expect(openDB).toHaveBeenCalledTimes(2);
  });
});
