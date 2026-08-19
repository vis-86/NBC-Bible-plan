// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSongsMock,
  getSongMock,
  getPlanMock,
  getProgressMock,
  getWeeklyPlanMock,
  getSetlistsMock,
  getSetlistMock,
  mutateMock,
} = vi.hoisted(() => ({
  getSongsMock: vi.fn(),
  getSongMock: vi.fn(),
  getPlanMock: vi.fn(),
  getProgressMock: vi.fn(),
  getWeeklyPlanMock: vi.fn(),
  getSetlistsMock: vi.fn(),
  getSetlistMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  songsApi: { getSongs: getSongsMock, getSong: getSongMock },
  planApi: { getPlan: getPlanMock },
  progressApi: { getProgress: getProgressMock },
  weeklyPlanApi: { getWeeklyPlan: getWeeklyPlanMock },
  setlistsApi: { getSetlists: getSetlistsMock, getSetlist: getSetlistMock },
}));

vi.mock('@/shared/services/api/graphql', async () => {
  const actual = await vi.importActual<typeof import('@/shared/services/api/graphql')>(
    '@/shared/services/api/graphql'
  );
  return { ...actual, graphqlClient: { mutate: mutateMock, query: vi.fn() } };
});

import {
  downloadBibleTranslation,
  downloadSongs,
  downloadPlan,
  downloadSetlists,
  getManifest,
  requestPersistentStorage,
  clearAllOfflineData,
  syncSongsDelta,
  syncSetlistsDelta,
} from './downloadManager';
import { getDB, __deleteDB } from './db';
import { getApiCache, persistApiCache, SONGS_LIST_CACHE_KEY } from './readThrough';
import { getCachedSong } from '@/features/songs/lib/offlineSongs';
import { enqueueSingleProgress, getPendingOutbox } from './outbox';
import { readSetlistThrough, readSetlistsThrough, setlistCacheKey } from '@/features/setlists/lib/offlineSetlists';

describe('offline/downloadManager', () => {
  beforeEach(async () => {
    await __deleteDB();
    getSongsMock.mockReset();
    getSongMock.mockReset();
    getPlanMock.mockReset();
    getProgressMock.mockReset();
    getWeeklyPlanMock.mockReset();
    getSetlistsMock.mockReset();
    getSetlistMock.mockReset();
    mutateMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('downloadBibleTranslation', () => {
    const payload = {
      translation: 'nrt2019',
      books: {
        'Бытие': { name: 'Бытие', chapters: { '1': 'глава 1 текст', '2': 'глава 2 текст' } },
        'Исход': { name: 'Исход', chapters: { '1': 'исход глава 1' } },
      },
    };

    it('без стрима (response.body отсутствует) — парсит через response.text() и пишет все главы в IDB', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => null },
          body: undefined,
          text: async () => JSON.stringify(payload),
        })
      );

      await downloadBibleTranslation('nrt2019');

      const db = await getDB();
      expect(await db.get('bibleChapters', 'nrt2019|Бытие|1')).toMatchObject({ text: 'глава 1 текст' });
      expect(await db.get('bibleChapters', 'nrt2019|Бытие|2')).toMatchObject({ text: 'глава 2 текст' });
      expect(await db.get('bibleChapters', 'nrt2019|Исход|1')).toMatchObject({ text: 'исход глава 1' });

      const manifest = await getManifest();
      expect(manifest.find((m) => m.key === 'nrt2019')).toMatchObject({ itemCount: 3 });
    });

    it('со стримом — читает чанки через reader и корректно собирает JSON', async () => {
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      const half = Math.floor(bytes.length / 2);
      const chunks = [bytes.slice(0, half), bytes.slice(half)];
      let i = 0;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: (name: string) => (name === 'content-length' ? String(bytes.length) : null) },
          body: {
            getReader: () => ({
              read: async () => {
                if (i < chunks.length) {
                  return { done: false, value: chunks[i++] };
                }
                return { done: true, value: undefined };
              },
            }),
          },
        })
      );

      const onProgress = vi.fn();
      await downloadBibleTranslation('nrt2019', onProgress);

      const db = await getDB();
      expect(await db.get('bibleChapters', 'nrt2019|Бытие|1')).toMatchObject({ text: 'глава 1 текст' });
      expect(onProgress).toHaveBeenCalled();
    });

    it('бросает при HTTP-ошибке', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      await expect(downloadBibleTranslation('nrt2019')).rejects.toThrow();
    });
  });

  describe('downloadSongs', () => {
    it('качает список карточек, затем контент каждой песни, пишет в IDB songs + manifest', async () => {
      getSongsMock.mockResolvedValue({
        songs: [
          { id: '1', title: 'Песня 1' },
          { id: '2', title: 'Песня 2' },
        ],
      });
      getSongMock.mockImplementation(async (id: string) => ({
        song: { id, title: `Песня ${id}`, content: `content-${id}` },
      }));

      const onProgress = vi.fn();
      await downloadSongs(onProgress);

      expect(getSongMock).toHaveBeenCalledTimes(2);
      const db = await getDB();
      expect(await db.get('songs', '1')).toMatchObject({ id: '1', data: { content: 'content-1' } });
      expect(await db.get('songs', '2')).toMatchObject({ id: '2', data: { content: 'content-2' } });
      expect(onProgress).toHaveBeenLastCalledWith(2, 2);

      const manifest = await getManifest();
      expect(manifest.find((m) => m.key === 'songs')).toMatchObject({ itemCount: 2 });
    });

    it('прогревает apiCache списком под тем же ключом и в том же shape, что читает useSongs', async () => {
      // Регрессия: список писался только в store `songs`, а useSongs читает
      // readThrough('songs:list') → офлайн после «скачать песни» висел вечно.
      const list = { songs: [{ id: '1', title: 'Песня 1' }] };
      getSongsMock.mockResolvedValue(list);
      getSongMock.mockResolvedValue({ song: { id: '1', title: 'Песня 1', content: 'c' } });

      await downloadSongs();

      expect(await getApiCache('songs:list')).toEqual(list);
    });

    it('прерванная загрузка контента всё равно оставляет список песен в apiCache', async () => {
      const list = { songs: [{ id: '1', title: 'Песня 1' }] };
      getSongsMock.mockResolvedValue(list);
      getSongMock.mockRejectedValue(new Error('network died'));

      await expect(downloadSongs()).rejects.toThrow('network died');

      expect(await getApiCache('songs:list')).toEqual(list);
    });
  });

  describe('downloadPlan', () => {
    it('прогревает apiCache для plan/progress/weekly/books теми же ключами, что читает read-through', async () => {
      getPlanMock.mockResolvedValue({ plan: [{ id: 1 }] });
      getProgressMock.mockResolvedValue({ progress: [{ day: 1, id: 10, count: 2 }] });
      getWeeklyPlanMock.mockResolvedValue({ book: 'proverbs', weeks: [] });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ json: async () => ({ books: [{ name: 'Бытие', chapters: 50 }] }) })
      );

      await downloadPlan();

      expect(await getApiCache('plan:days')).toEqual({ plan: [{ id: 1 }] });
      // plan:progress прогревается тем же ключом, что читает PlanContext.fetchPlan —
      // иначе «скачал всё, ни разу не открыв план» роняет дашборд в «Load failed».
      expect(await getApiCache('plan:progress')).toEqual({ progress: [{ day: 1, id: 10, count: 2 }] });
      expect(await getApiCache('plan:weekly:proverbs')).toEqual({ book: 'proverbs', weeks: [] });
      expect(await getApiCache('bible:books')).toEqual({ books: [{ name: 'Бытие', chapters: 50 }] });

      const manifest = await getManifest();
      expect(manifest.find((m) => m.key === 'plan')).toBeDefined();
    });
  });

  describe('downloadSetlists', () => {
    it('после downloadSetlists() читатель (readSetlistsThrough/readSetlistThrough) отдаёт данные офлайн', async () => {
      const list = {
        setlists: [
          { id: 's1', title: 'Воскресное', date: null, itemCount: 2 },
          { id: 's2', title: 'Молодёжка', date: null, itemCount: 1 },
        ],
      };
      getSetlistsMock.mockResolvedValue(list);
      getSetlistMock.mockImplementation(async (id: string) => ({
        setlist: { id, title: `Сет ${id}`, date: null, items: [] },
      }));

      await downloadSetlists();

      // Тем же вызовом, что читают экраны, а не сравнением строк ключей apiCache.
      // Мгновенный reject fetcher-а имитирует реальный офлайн (навигатор без сети).
      getSetlistsMock.mockRejectedValue(new TypeError('Failed to fetch'));
      getSetlistMock.mockRejectedValue(new TypeError('Failed to fetch'));

      expect(await readSetlistsThrough()).toEqual(list.setlists);
      expect(await readSetlistThrough('s1')).toEqual({ id: 's1', title: 'Сет s1', date: null, items: [] });

      const manifest = await getManifest();
      expect(manifest.find((m) => m.key === 'setlists')).toMatchObject({ itemCount: 2 });
    });

    it('ошибка при прогреве детали одного сета не прерывает прогрев остальных', async () => {
      getSetlistsMock.mockResolvedValue({
        setlists: [
          { id: 's1', title: 'Сломанный', date: null, itemCount: 0 },
          { id: 's2', title: 'Рабочий', date: null, itemCount: 1 },
        ],
      });
      getSetlistMock.mockImplementation(async (id: string) => {
        if (id === 's1') throw new Error('network died');
        return { setlist: { id, title: `Сет ${id}`, date: null, items: [] } };
      });

      await expect(downloadSetlists()).resolves.toBeUndefined();

      expect(await getApiCache('setlists:item:s1')).toBeUndefined();
      expect(await getApiCache('setlists:item:s2')).toEqual({
        setlist: { id: 's2', title: 'Сет s2', date: null, items: [] },
      });
    });
  });

  describe('requestPersistentStorage', () => {
    it('возвращает false, если navigator.storage.persist недоступен', async () => {
      expect(await requestPersistentStorage()).toBe(false);
    });
  });

  describe('clearAllOfflineData', () => {
    it('чистит bibleChapters/songs/apiCache/manifest, когда outbox пуст', async () => {
      const db = await getDB();
      await db.put('bibleChapters', { key: 'rst|Бытие|1', translationId: 'rst', book: 'Бытие', chapter: 1, text: 't', updatedAt: 1 });
      await db.put('songs', { id: '1', data: {}, updatedAt: 1 });
      await db.put('apiCache', { key: 'plan:days', data: {}, updatedAt: 1 });
      await db.put('manifest', { key: 'rst', downloadedAt: 1 });

      const result = await clearAllOfflineData();

      expect(result).toEqual({ cleared: true, pendingOutboxCount: 0 });
      expect(await db.count('bibleChapters')).toBe(0);
      expect(await db.count('songs')).toBe(0);
      expect(await db.count('apiCache')).toBe(0);
      expect(await db.count('manifest')).toBe(0);
    });

    it('НЕ трогает meta (last-known-user)', async () => {
      const db = await getDB();
      await db.put('meta', { key: 'last-known-user', value: { directus_id: 'u1' } });

      await clearAllOfflineData();

      expect(await db.get('meta', 'last-known-user')).toEqual({ key: 'last-known-user', value: { directus_id: 'u1' } });
    });

    it('при несинканном outbox без force — не чистит и сообщает pendingOutboxCount', async () => {
      mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await enqueueSingleProgress(1, 1);

      const db = await getDB();
      await db.put('apiCache', { key: 'plan:days', data: {}, updatedAt: 1 });

      const result = await clearAllOfflineData();

      expect(result).toEqual({ cleared: false, pendingOutboxCount: 1 });
      expect(await db.count('apiCache')).toBe(1);
      expect(await getPendingOutbox()).toHaveLength(1);
    });

    it('force: true чистит данные, даже если outbox не пуст (outbox сам не трогается)', async () => {
      mutateMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await enqueueSingleProgress(1, 1);

      const db = await getDB();
      await db.put('apiCache', { key: 'plan:days', data: {}, updatedAt: 1 });

      const result = await clearAllOfflineData({ force: true });

      expect(result).toEqual({ cleared: true, pendingOutboxCount: 1 });
      expect(await db.count('apiCache')).toBe(0);
      expect(await getPendingOutbox()).toHaveLength(1);
    });

    it('успешный replay перед очисткой опустошает outbox, и чистка проходит без force', async () => {
      mutateMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await enqueueSingleProgress(1, 1);
      expect(await getPendingOutbox()).toHaveLength(1);

      mutateMock.mockReset();
      mutateMock.mockResolvedValue({ success: true });

      const result = await clearAllOfflineData();

      expect(result).toEqual({ cleared: true, pendingOutboxCount: 0 });
      expect(await getPendingOutbox()).toEqual([]);
    });
  });
});

describe('offline/downloadManager — дельта-синк (T15)', () => {
  beforeEach(async () => {
    await __deleteDB();
    getSongsMock.mockReset();
    getSongMock.mockReset();
    getSetlistsMock.mockReset();
    getSetlistMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('syncSongsDelta', () => {
    it('версия совпала -> ни одного запроса детали', async () => {
      const res = await syncSongsDelta([['1', 'a']], { '1': 'a' });

      expect(getSongMock).not.toHaveBeenCalled();
      expect(getSongsMock).not.toHaveBeenCalled();
      expect(res.stats).toEqual({ checked: 1, updated: 0, removed: 0 });
    });

    it('изменилась одна песня -> ровно один запрос детали, песня в сторе `songs`', async () => {
      getSongMock.mockResolvedValue({ song: { id: '2', title: 'Вторая', content: 'x' } });
      getSongsMock.mockResolvedValue({ songs: [{ id: '2', title: 'Вторая' }] });

      const res = await syncSongsDelta(
        [
          ['1', 'a'],
          ['2', 'b2'],
        ],
        { '1': 'a', '2': 'b1' }
      );

      expect(getSongMock).toHaveBeenCalledTimes(1);
      expect(getSongMock).toHaveBeenCalledWith('2');
      expect(res.versions).toEqual({ '1': 'a', '2': 'b2' });
      expect(res.stats.updated).toBe(1);

      // Ассерт тем же вызовом, которым песню читает экран.
      expect(await getCachedSong('2')).toEqual({ id: '2', title: 'Вторая', content: 'x' });
      // И список — тем же ключом, что читает useSongs.
      expect(await getApiCache(SONGS_LIST_CACHE_KEY)).toEqual({ songs: [{ id: '2', title: 'Вторая' }] });
    });

    it('песня исчезла из манифеста -> удалена из `songs` и из `apiCache`', async () => {
      const db = await getDB();
      await db.put('songs', { id: '9', data: { id: '9', title: 'Снятая' }, updatedAt: Date.now() });
      await db.put('apiCache', { key: 'songs:item:9', data: {}, updatedAt: Date.now() });
      getSongsMock.mockResolvedValue({ songs: [] });

      const res = await syncSongsDelta([], { '9': 'v' });

      expect(await getCachedSong('9')).toBeUndefined();
      expect(await getApiCache('songs:item:9')).toBeUndefined();
      expect(res.versions).toEqual({});
      expect(res.stats.removed).toBe(1);
    });

    it('сбой сети посреди дельты пробрасывается наружу (версии фиксирует вызывающий)', async () => {
      getSongMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(syncSongsDelta([['1', 'a']], {})).rejects.toBeInstanceOf(TypeError);
    });
  });

  describe('syncSetlistsDelta', () => {
    it('изменился один сет -> одна деталь, кеш под ключом, который читает экран', async () => {
      getSetlistMock.mockResolvedValue({ setlist: { id: 's1', title: 'Сет', date: null, items: [] } });
      getSetlistsMock.mockResolvedValue({ setlists: [{ id: 's1', title: 'Сет', date: null, items: [] }] });

      const res = await syncSetlistsDelta([['s1', 'h2']], { s1: 'h1' });

      expect(getSetlistMock).toHaveBeenCalledTimes(1);
      expect(res.versions).toEqual({ s1: 'h2' });
      expect(await readSetlistThrough('s1')).toEqual({ id: 's1', title: 'Сет', date: null, items: [] });
    });

    it('сет исчез из манифеста -> его деталь вычищена из apiCache', async () => {
      await persistApiCache(setlistCacheKey('s9'), { setlist: { id: 's9' } });
      getSetlistsMock.mockResolvedValue({ setlists: [] });

      const res = await syncSetlistsDelta([], { s9: 'h' });

      expect(await getApiCache(setlistCacheKey('s9'))).toBeUndefined();
      expect(res.versions).toEqual({});
      expect(res.stats.removed).toBe(1);
    });
  });
});
