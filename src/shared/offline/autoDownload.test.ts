// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSettingsMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  readingSettingsApi: { getSettings: getSettingsMock },
}));

const { downloadPlanMock, downloadSongsMock, downloadSetlistsMock, downloadBibleTranslationMock, getManifestMock } =
  vi.hoisted(() => ({
    downloadPlanMock: vi.fn(),
    downloadSongsMock: vi.fn(),
    downloadSetlistsMock: vi.fn(),
    downloadBibleTranslationMock: vi.fn(),
    getManifestMock: vi.fn(),
  }));

vi.mock('./downloadManager', () => ({
  getManifest: getManifestMock,
  downloadPlan: downloadPlanMock,
  downloadSongs: downloadSongsMock,
  downloadSetlists: downloadSetlistsMock,
  downloadBibleTranslation: downloadBibleTranslationMock,
}));

import { ensureOfflineData, scheduleEnsureOfflineData, __resetAutoDownloadGuard } from './autoDownload';

describe('offline/autoDownload', () => {
  beforeEach(() => {
    getSettingsMock.mockReset().mockResolvedValue({ settings: { nt_translation: 'rst' } });
    downloadPlanMock.mockReset().mockResolvedValue(undefined);
    downloadSongsMock.mockReset().mockResolvedValue(undefined);
    downloadSetlistsMock.mockReset().mockResolvedValue(undefined);
    downloadBibleTranslationMock.mockReset().mockResolvedValue(undefined);
    getManifestMock.mockReset().mockResolvedValue([]);
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
