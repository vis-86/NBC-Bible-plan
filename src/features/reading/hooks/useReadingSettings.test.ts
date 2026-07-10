// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { __resetDBConnection } from '@/shared/offline/db';
import { resetNetworkSuspicionForTests } from '@/shared/offline/networkHealth';

const { getSettingsMock, updateSettingsMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  readingSettingsApi: { getSettings: getSettingsMock, updateSettings: updateSettingsMock },
}));

import { useReadingSettings } from './useReadingSettings';

describe('useReadingSettings — verse_per_line', () => {
  beforeEach(() => {
    __resetDBConnection();
    resetNetworkSuspicionForTests();
    getSettingsMock.mockReset();
    updateSettingsMock.mockReset().mockResolvedValue(undefined);
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
