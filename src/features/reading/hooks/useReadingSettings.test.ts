// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { __resetDBConnection, getDB } from '@/shared/offline/db';
import { resetNetworkSuspicionForTests } from '@/shared/offline/networkHealth';

const { getSettingsMock, updateSettingsMock, scheduleEnsureMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
  scheduleEnsureMock: vi.fn(),
}));

vi.mock('@/shared/offline/autoDownload', () => ({
  scheduleEnsureOfflineData: scheduleEnsureMock,
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  readingSettingsApi: { getSettings: getSettingsMock, updateSettings: updateSettingsMock },
}));

import { READING_SETTINGS_SNAPSHOT_KEY, useReadingSettings } from './useReadingSettings';

describe('useReadingSettings — verse_per_line', () => {
  beforeEach(async () => {
    __resetDBConnection();
    resetNetworkSuspicionForTests();
    // Чтение стало cache-first: запись предыдущего теста моложе TTL перебила бы мок
    // следующего. Чистим apiCache, иначе тесты видят чужие настройки.
    const db = await getDB();
    await db.clear('apiCache');
    __resetDBConnection();
    getSettingsMock.mockReset();
    updateSettingsMock.mockReset().mockResolvedValue(undefined);
    scheduleEnsureMock.mockReset();
    window.localStorage.clear();
  });

  it('дефолт verse_per_line=false, когда сервер не вернул поле (старая запись без поля)', async () => {
    getSettingsMock.mockResolvedValue({
      settings: {
        font_size: 20,
        line_height: 1.6,
        text_align: 'left',
        theme: 'system',
        verse_numbers_visible: true,
        ot_translation: 'rst',
        nt_translation: 'rst'
        // verse_per_line отсутствует
      }
    });

    const { result } = renderHook(() => useReadingSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.verse_per_line).toBe(false);
  });

  it('коэрция кривого значения (не boolean) в false', async () => {
    getSettingsMock.mockResolvedValue({
      settings: {
        font_size: 20,
        line_height: 1.6,
        text_align: 'left',
        theme: 'system',
        verse_numbers_visible: true,
        ot_translation: 'rst',
        nt_translation: 'rst',
        verse_per_line: 'yes' // не boolean
      }
    });

    const { result } = renderHook(() => useReadingSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.verse_per_line).toBe(false);
  });

  it('корректное значение true из ответа сервера сохраняется как есть', async () => {
    getSettingsMock.mockResolvedValue({
      settings: {
        font_size: 20,
        line_height: 1.6,
        text_align: 'left',
        theme: 'system',
        verse_numbers_visible: true,
        ot_translation: 'rst',
        nt_translation: 'rst',
        verse_per_line: true
      }
    });

    const { result } = renderHook(() => useReadingSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.verse_per_line).toBe(true);
  });

  it('updateSettings шлёт verse_per_line в теле запроса', async () => {
    getSettingsMock.mockResolvedValue({
      settings: {
        font_size: 20,
        line_height: 1.6,
        text_align: 'left',
        theme: 'system',
        verse_numbers_visible: true,
        ot_translation: 'rst',
        nt_translation: 'rst',
        verse_per_line: false
      }
    });

    const { result } = renderHook(() => useReadingSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.updateSettings({ ...result.current.settings, verse_per_line: true });

    expect(updateSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ verse_per_line: true })
    );
  });
});

describe('useReadingSettings — снимок переводов и докачка', () => {
  beforeEach(async () => {
    __resetDBConnection();
    const db = await getDB();
    await db.clear('apiCache');
    __resetDBConnection();
    getSettingsMock.mockReset();
    updateSettingsMock.mockReset().mockResolvedValue(undefined);
    scheduleEnsureMock.mockReset();
    window.localStorage.clear();
    resetNetworkSuspicionForTests();
  });

  const SERVER_SETTINGS = {
    font_size: 20,
    line_height: 1.6,
    text_align: 'left',
    theme: 'system',
    verse_numbers_visible: true,
    ot_translation: 'rst',
    nt_translation: 'kassian2019',
    verse_per_line: false,
  };

  it('первый рендер берёт переводы из снимка, НЕ дожидаясь сети', () => {
    window.localStorage.setItem(
      READING_SETTINGS_SNAPSHOT_KEY,
      JSON.stringify({ ...SERVER_SETTINGS, nt_translation: 'kassian2019' })
    );
    // Сеть висит вечно — снимок обязан отработать синхронно.
    getSettingsMock.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useReadingSettings());

    expect(result.current.settings.nt_translation).toBe('kassian2019');
    expect(result.current.settings.ot_translation).toBe('rst');
  });

  it('битый снимок не роняет хук — берутся дефолты', () => {
    window.localStorage.setItem(READING_SETTINGS_SNAPSHOT_KEY, '{не json');
    getSettingsMock.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useReadingSettings());

    expect(result.current.settings.nt_translation).toBe('rst');
  });

  it('успешная загрузка обновляет снимок', async () => {
    getSettingsMock.mockResolvedValue({ settings: SERVER_SETTINGS });

    const { result } = renderHook(() => useReadingSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const snapshot = JSON.parse(window.localStorage.getItem(READING_SETTINGS_SNAPSHOT_KEY)!);
    expect(snapshot.nt_translation).toBe('kassian2019');
  });

  it('смена настроек пишет снимок и запускает докачку офлайн-данных', async () => {
    getSettingsMock.mockResolvedValue({ settings: SERVER_SETTINGS });

    const { result } = renderHook(() => useReadingSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateSettings({ ...result.current.settings, ot_translation: 'nrt2019' });
    });

    const snapshot = JSON.parse(window.localStorage.getItem(READING_SETTINGS_SNAPSHOT_KEY)!);
    expect(snapshot.ot_translation).toBe('nrt2019');
    expect(scheduleEnsureMock).toHaveBeenCalledTimes(1);
  });
});
