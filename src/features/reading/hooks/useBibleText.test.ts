// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { __resetDBConnection } from '@/shared/offline/db';
import { resetNetworkSuspicionForTests } from '@/shared/offline/networkHealth';

const { getTextMock } = vi.hoisted(() => ({
  getTextMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  bibleApi: { getText: getTextMock },
}));

import { useBibleText } from './useBibleText';
import { getCachedText, getPersistedText } from '../bible-text-cache';

describe('useBibleText', () => {
  beforeEach(() => {
    __resetDBConnection();
    resetNetworkSuspicionForTests();
    getTextMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('смена translationId в аргументах хука вызывает новый fetch и новый текст', async () => {
    getTextMock.mockResolvedValueOnce({ text: 'rst-текст', translation: 'rst' });
    getTextMock.mockResolvedValueOnce({ text: 'nrt-текст', translation: 'nrt2019' });

    const { result, rerender } = renderHook(
      ({ translationId }) => useBibleText({ book: 'Бытие', chapter: 1 }, translationId),
      { initialProps: { translationId: 'rst' } }
    );

    await waitFor(() => expect(result.current.text).toBe('rst-текст'));

    rerender({ translationId: 'nrt2019' });

    await waitFor(() => expect(result.current.text).toBe('nrt-текст'));
    expect(getTextMock).toHaveBeenCalledTimes(2);
  });

  it('ответ с response.translation !== translationId не отравляет ключ запрошенного перевода', async () => {
    // Регрессия: сервер резолвит перевод иначе, чем запросил клиент (например,
    // поле перевода не сохранилось в Directus) — следующий запрос под ПРАВИЛЬНЫМ
    // ключом не должен получать чужой текст из кеша и обязан снова пойти в сеть.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getTextMock.mockResolvedValueOnce({ text: 'дефолтный-текст', translation: 'rst' });

    const { result, unmount } = renderHook(() => useBibleText({ book: 'Левит', chapter: 2 }, 'nrt2019'));

    await waitFor(() => expect(result.current.text).toBe('дефолтный-текст'));

    expect(warnSpy).toHaveBeenCalled();
    // Ключ запрошенного перевода (nrt2019) не должен быть отравлен ответом под rst.
    expect(getCachedText('Левит', 2, 'nrt2019')).toBeUndefined();
    // Ответ закеширован под ФАКТИЧЕСКИМ переводом из ответа сервера.
    expect(getCachedText('Левит', 2, 'rst')).toBe('дефолтный-текст');
    unmount();

    getTextMock.mockResolvedValueOnce({ text: 'nrt-текст-повторно', translation: 'nrt2019' });
    const { result: result2 } = renderHook(() => useBibleText({ book: 'Левит', chapter: 2 }, 'nrt2019'));

    await waitFor(() => expect(result2.current.text).toBe('nrt-текст-повторно'));
    expect(getTextMock).toHaveBeenCalledTimes(2);
  });

  it('ключ memory-кеша совпадает с ключом IDB (оба по response.translation)', async () => {
    getTextMock.mockResolvedValueOnce({ text: 'синодальный-текст', translation: 'rst' });

    const { result } = renderHook(() => useBibleText({ book: 'Исход', chapter: 3 }, 'nrt2019'));

    await waitFor(() => expect(result.current.text).toBe('синодальный-текст'));

    expect(getCachedText('Исход', 3, 'rst')).toBe('синодальный-текст');
    await waitFor(async () => {
      expect(await getPersistedText('Исход', 3, 'rst')).toBe('синодальный-текст');
    });
  });
});
