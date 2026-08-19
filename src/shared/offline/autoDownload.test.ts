// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSettingsMock, getSyncManifestMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  getSyncManifestMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  readingSettingsApi: { getSettings: getSettingsMock },
  syncApi: { getManifest: getSyncManifestMock },
}));

const {
  downloadPlanMock,
  downloadSongsMock,
  downloadSetlistsMock,
  downloadBibleTranslationMock,
  getManifestMock,
  syncSongsDeltaMock,
  syncSetlistsDeltaMock,
} = vi.hoisted(() => ({
  downloadPlanMock: vi.fn(),
  downloadSongsMock: vi.fn(),
  downloadSetlistsMock: vi.fn(),
  downloadBibleTranslationMock: vi.fn(),
  getManifestMock: vi.fn(),
  syncSongsDeltaMock: vi.fn(),
  syncSetlistsDeltaMock: vi.fn(),
}));

vi.mock('./downloadManager', () => ({
  getManifest: getManifestMock,
  downloadPlan: downloadPlanMock,
  downloadSongs: downloadSongsMock,
  downloadSetlists: downloadSetlistsMock,
  downloadBibleTranslation: downloadBibleTranslationMock,
  syncSongsDelta: syncSongsDeltaMock,
  syncSetlistsDelta: syncSetlistsDeltaMock,
}));

import { __resetDBConnection, getDB } from './db';
import { getSyncEtag, getSyncVersions, saveSyncEtag } from './syncVersions';
import { ensureOfflineData, scheduleEnsureOfflineData, __resetAutoDownloadGuard } from './autoDownload';

describe('offline/autoDownload', () => {
  beforeEach(() => {
    getSettingsMock.mockReset().mockResolvedValue({ settings: { nt_translation: 'rst' } });
    downloadPlanMock.mockReset().mockResolvedValue(undefined);
    downloadSongsMock.mockReset().mockResolvedValue(undefined);
    downloadSetlistsMock.mockReset().mockResolvedValue(undefined);
    downloadBibleTranslationMock.mockReset().mockResolvedValue(undefined);
    getManifestMock.mockReset().mockResolvedValue([]);
    // По умолчанию дельта-синк отключён (304) — существующие кейсы проверяют baseline.
    getSyncManifestMock.mockReset().mockResolvedValue({ status: 'not-modified' });
    syncSongsDeltaMock.mockReset().mockResolvedValue({ stats: { checked: 0, updated: 0, removed: 0 }, versions: {} });
    syncSetlistsDeltaMock
      .mockReset()
      .mockResolvedValue({ stats: { checked: 0, updated: 0, removed: 0 }, versions: {} });
    __resetAutoDownloadGuard();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('ensureOfflineData', () => {
    it('полный manifest (план, песни, сетлисты, дефолтный перевод уже есть) -> ноль загрузок', async () => {
      getManifestMock.mockResolvedValue([
        { key: 'plan', downloadedAt: 1 },
        { key: 'songs', downloadedAt: 1 },
        { key: 'setlists', downloadedAt: 1 },
        { key: 'rst', downloadedAt: 1 },
      ]);

      await ensureOfflineData();

      expect(downloadPlanMock).not.toHaveBeenCalled();
      expect(downloadSongsMock).not.toHaveBeenCalled();
      expect(downloadSetlistsMock).not.toHaveBeenCalled();
      expect(downloadBibleTranslationMock).not.toHaveBeenCalled();
    });

    it('частичный manifest -> докачивает только недостающее', async () => {
      getManifestMock.mockResolvedValue([{ key: 'plan', downloadedAt: 1 }]);

      await ensureOfflineData();

      expect(downloadPlanMock).not.toHaveBeenCalled();
      expect(downloadSongsMock).toHaveBeenCalledTimes(1);
      expect(downloadSetlistsMock).toHaveBeenCalledTimes(1);
      expect(downloadBibleTranslationMock).toHaveBeenCalledTimes(1);
      expect(downloadBibleTranslationMock).toHaveBeenCalledWith('rst');
    });

    it('nt_translation из настроек уважается, если разрешён для self-host', async () => {
      getSettingsMock.mockResolvedValue({ settings: { nt_translation: 'kassian2019' } });
      getManifestMock.mockResolvedValue([
        { key: 'plan', downloadedAt: 1 },
        { key: 'songs', downloadedAt: 1 },
        { key: 'setlists', downloadedAt: 1 },
      ]);

      await ensureOfflineData();

      expect(downloadBibleTranslationMock).toHaveBeenCalledWith('kassian2019');
    });

    it('nt_translation не self-host (напр. cassian) -> фолбэк на rst', async () => {
      getSettingsMock.mockResolvedValue({ settings: { nt_translation: 'cassian' } });
      getManifestMock.mockResolvedValue([
        { key: 'plan', downloadedAt: 1 },
        { key: 'songs', downloadedAt: 1 },
        { key: 'setlists', downloadedAt: 1 },
      ]);

      await ensureOfflineData();

      expect(downloadBibleTranslationMock).toHaveBeenCalledWith('rst');
    });

    it('ошибка сети при чтении reading-settings -> не бросает, использует дефолтный перевод', async () => {
      getSettingsMock.mockRejectedValue(new TypeError('Failed to fetch'));
      getManifestMock.mockResolvedValue([]);

      await expect(ensureOfflineData()).resolves.toBeUndefined();

      expect(downloadBibleTranslationMock).toHaveBeenCalledWith('rst');
    });

    it('обрыв одного job (напр. downloadSongs) не блокирует остальные и не бросает', async () => {
      downloadSongsMock.mockRejectedValue(new Error('network down'));
      getManifestMock.mockResolvedValue([]);

      await expect(ensureOfflineData()).resolves.toBeUndefined();

      expect(downloadPlanMock).toHaveBeenCalledTimes(1);
      expect(downloadSetlistsMock).toHaveBeenCalledTimes(1);
      expect(downloadBibleTranslationMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('scheduleEnsureOfflineData — параллельный запуск', () => {
    it('второй вызов, пока первый ещё выполняется (in-flight), не запускает повторный прогон', async () => {
      vi.useFakeTimers();
      // requestIdleCallback недоступен в jsdom по умолчанию — fallback на setTimeout.
      getManifestMock.mockResolvedValue([]);

      scheduleEnsureOfflineData();
      scheduleEnsureOfflineData();

      await vi.runAllTimersAsync();

      expect(getManifestMock).toHaveBeenCalledTimes(1);
    });

    it('повторный вызов после завершения предыдущего прогона планирует новый', async () => {
      vi.useFakeTimers();
      getManifestMock.mockResolvedValue([]);

      scheduleEnsureOfflineData();
      await vi.runAllTimersAsync();
      expect(getManifestMock).toHaveBeenCalledTimes(1);

      scheduleEnsureOfflineData();
      await vi.runAllTimersAsync();
      expect(getManifestMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe('offline/autoDownload — дельта-синк (T15)', () => {
  beforeEach(async () => {
    getSettingsMock.mockReset().mockResolvedValue({ settings: { nt_translation: 'rst' } });
    downloadPlanMock.mockReset().mockResolvedValue(undefined);
    downloadSongsMock.mockReset().mockResolvedValue(undefined);
    downloadSetlistsMock.mockReset().mockResolvedValue(undefined);
    downloadBibleTranslationMock.mockReset().mockResolvedValue(undefined);
    // Базовый набор уже скачан — проверяем именно дельту.
    getManifestMock.mockReset().mockResolvedValue([
      { key: 'plan' },
      { key: 'songs' },
      { key: 'setlists' },
      { key: 'rst' },
    ]);
    getSyncManifestMock.mockReset();
    syncSongsDeltaMock.mockReset();
    syncSetlistsDeltaMock.mockReset();
    __resetAutoDownloadGuard();

    __resetDBConnection();
    const db = await getDB();
    await db.clear('meta');
    __resetDBConnection();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('офлайн: ни манифеста, ни докачки', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    await ensureOfflineData();

    expect(getSyncManifestMock).not.toHaveBeenCalled();
    expect(syncSongsDeltaMock).not.toHaveBeenCalled();
    expect(downloadSongsMock).not.toHaveBeenCalled();
  });

  it('304: ни одного запроса деталей, версии не трогаем', async () => {
    getSyncManifestMock.mockResolvedValue({ status: 'not-modified' });

    await ensureOfflineData();

    expect(syncSongsDeltaMock).not.toHaveBeenCalled();
    expect(syncSetlistsDeltaMock).not.toHaveBeenCalled();
    expect(await getSyncVersions()).toEqual({ songs: {}, setlists: {}, plan: null });
  });

  it('200: дельта применяется, версии и ETag фиксируются', async () => {
    getSyncManifestMock.mockResolvedValue({
      status: 'ok',
      etag: '"v1"',
      manifest: { songs: [['1', 'a']], setlists: [['s1', 'h1']], plan: 'p1' },
    });
    syncSongsDeltaMock.mockResolvedValue({
      stats: { checked: 1, updated: 1, removed: 0 },
      versions: { '1': 'a' },
    });
    syncSetlistsDeltaMock.mockResolvedValue({
      stats: { checked: 1, updated: 1, removed: 0 },
      versions: { s1: 'h1' },
    });

    await ensureOfflineData();

    expect(syncSongsDeltaMock).toHaveBeenCalledWith([['1', 'a']], {});
    expect(await getSyncVersions()).toEqual({ songs: { '1': 'a' }, setlists: { s1: 'h1' }, plan: 'p1' });
    expect(await getSyncEtag()).toBe('"v1"');
  });

  it('сохранённый ETag уходит в запрос манифеста', async () => {
    await saveSyncEtag('"stored"');
    getSyncManifestMock.mockResolvedValue({ status: 'not-modified' });

    await ensureOfflineData();

    expect(getSyncManifestMock).toHaveBeenCalledWith('"stored"');
  });

  it('сеть падает посреди дельты -> версии НЕ записаны (следующий запуск дочистит)', async () => {
    getSyncManifestMock.mockResolvedValue({
      status: 'ok',
      etag: '"v1"',
      manifest: { songs: [['1', 'a']], setlists: [['s1', 'h1']], plan: 'p1' },
    });
    syncSongsDeltaMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await ensureOfflineData();

    expect(await getSyncVersions()).toEqual({ songs: {}, setlists: {}, plan: null });
    expect(await getSyncEtag()).toBeNull();
  });

  it('первый запуск (baseline только что скачан) не качает каталог повторно', async () => {
    getManifestMock.mockResolvedValue([]); // ничего не скачано
    getSyncManifestMock.mockResolvedValue({
      status: 'ok',
      etag: '"v1"',
      manifest: { songs: [['1', 'a']], setlists: [['s1', 'h1']], plan: 'p1' },
    });
    syncSongsDeltaMock.mockImplementation((manifestSongs, stored) =>
      Promise.resolve({ stats: { checked: 1, updated: 0, removed: 0 }, versions: stored })
    );
    syncSetlistsDeltaMock.mockImplementation((manifestSetlists, stored) =>
      Promise.resolve({ stats: { checked: 1, updated: 0, removed: 0 }, versions: stored })
    );

    await ensureOfflineData();

    // Версии уже совпадают с манифестом -> дельта не найдёт работы, план не перекачивается.
    expect(syncSongsDeltaMock).toHaveBeenCalledWith([['1', 'a']], { '1': 'a' });
    expect(syncSetlistsDeltaMock).toHaveBeenCalledWith([['s1', 'h1']], { s1: 'h1' });
    expect(downloadPlanMock).toHaveBeenCalledTimes(1); // ровно baseline, без повторного
  });
});

describe('offline/autoDownload — переводы Писания для обоих заветов', () => {
  beforeEach(() => {
    downloadPlanMock.mockReset().mockResolvedValue(undefined);
    downloadSongsMock.mockReset().mockResolvedValue(undefined);
    downloadSetlistsMock.mockReset().mockResolvedValue(undefined);
    downloadBibleTranslationMock.mockReset().mockResolvedValue(undefined);
    getSettingsMock.mockReset();
    // Всё, кроме переводов, уже скачано — смотрим только на переводы.
    getManifestMock.mockReset().mockResolvedValue([{ key: 'plan' }, { key: 'songs' }, { key: 'setlists' }]);
    getSyncManifestMock.mockReset().mockResolvedValue({ status: 'not-modified' });
    __resetAutoDownloadGuard();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('разные переводы ВЗ и НЗ -> качаются ОБА', async () => {
    getSettingsMock.mockResolvedValue({
      settings: { ot_translation: 'rst', nt_translation: 'kassian2019' },
    });

    await ensureOfflineData();

    expect(downloadBibleTranslationMock).toHaveBeenCalledTimes(2);
    expect(downloadBibleTranslationMock).toHaveBeenCalledWith('rst');
    expect(downloadBibleTranslationMock).toHaveBeenCalledWith('kassian2019');
  });

  it('один перевод на оба завета -> одна загрузка, не две', async () => {
    getSettingsMock.mockResolvedValue({
      settings: { ot_translation: 'nrt2019', nt_translation: 'nrt2019' },
    });

    await ensureOfflineData();

    expect(downloadBibleTranslationMock).toHaveBeenCalledTimes(1);
    expect(downloadBibleTranslationMock).toHaveBeenCalledWith('nrt2019');
  });

  it('НЗ-перевод без поддержки ВЗ не подменяет собой ВЗ — Ветхий Завет получает fallback', async () => {
    // Регрессия: раньше резолвился ТОЛЬКО nt_translation, и ВЗ оставался без копии.
    getSettingsMock.mockResolvedValue({
      settings: { ot_translation: 'kassian2019', nt_translation: 'kassian2019' },
    });

    await ensureOfflineData();

    // kassian2019 не поддерживает ВЗ -> для ВЗ берётся rst.
    expect(downloadBibleTranslationMock).toHaveBeenCalledWith('rst');
    expect(downloadBibleTranslationMock).toHaveBeenCalledWith('kassian2019');
  });

  it('уже скачанный перевод не качается повторно', async () => {
    getManifestMock.mockResolvedValue([
      { key: 'plan' },
      { key: 'songs' },
      { key: 'setlists' },
      { key: 'rst' },
    ]);
    getSettingsMock.mockResolvedValue({
      settings: { ot_translation: 'rst', nt_translation: 'kassian2019' },
    });

    await ensureOfflineData();

    expect(downloadBibleTranslationMock).toHaveBeenCalledTimes(1);
    expect(downloadBibleTranslationMock).toHaveBeenCalledWith('kassian2019');
  });

  it('настройки недоступны -> дефолтный перевод, докачка не падает', async () => {
    getSettingsMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await ensureOfflineData();

    expect(downloadBibleTranslationMock).toHaveBeenCalledTimes(1);
    expect(downloadBibleTranslationMock).toHaveBeenCalledWith('rst');
  });
});
