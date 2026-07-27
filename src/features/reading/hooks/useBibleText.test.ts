// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { __resetDBConnection } from '@/shared/offline/db';
import { resetNetworkSuspicionForTests } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS } from '@/shared/offline/networkTimeout';

const { getTextMock } = vi.hoisted(() => ({
  getTextMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  bibleApi: { getText: getTextMock },
}));

import { useBibleText } from './useBibleText';
import { getCachedText, setCachedText, getPersistedText } from '../bible-text-cache';

describe('useBibleText', () => {
  beforeEach(() => {
    __resetDBConnection();
    resetNetworkSuspicionForTests();
    getTextMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  });

  it('смена translationId в аргументах хука вызывает новый fetch и новый текст', async () => {
    // Прогрев соседних глав (Task 10) не в фокусе этого теста — соседняя глава (2)
    // предварительно закеширована, чтобы он не добавлял лишние вызовы bibleApi.getText
    // и не путал счётчик и очередь mockResolvedValueOnce ниже.
    setCachedText('Бытие', 2, 'rst', 'соседняя-глава');
    setCachedText('Бытие', 2, 'nrt2019', 'соседняя-глава');
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
    // Соседние главы (1, 3) — вне фокуса теста, закешированы заранее (см. комментарий выше).
    setCachedText('Левит', 1, 'nrt2019', 'соседняя-глава');
    setCachedText('Левит', 3, 'nrt2019', 'соседняя-глава');
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
    // Соседние главы (2, 4) — вне фокуса теста, закешированы заранее (см. комментарий выше).
    setCachedText('Исход', 2, 'nrt2019', 'соседняя-глава');
    setCachedText('Исход', 4, 'nrt2019', 'соседняя-глава');
    getTextMock.mockResolvedValueOnce({ text: 'синодальный-текст', translation: 'rst' });

    const { result } = renderHook(() => useBibleText({ book: 'Исход', chapter: 3 }, 'nrt2019'));

    await waitFor(() => expect(result.current.text).toBe('синодальный-текст'));

    expect(getCachedText('Исход', 3, 'rst')).toBe('синодальный-текст');
    await waitFor(async () => {
      expect(await getPersistedText('Исход', 3, 'rst')).toBe('синодальный-текст');
    });
  });

  describe('прогрев соседних глав (Task 10)', () => {
    it('после успешной загрузки главы соседние (chapter-1, chapter+1) уходят в кэш', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
      getTextMock.mockImplementation((book: string, chapter: number) =>
        Promise.resolve({ text: `${book}-${chapter}`, translation: 'rst' })
      );

      const { result } = renderHook(() => useBibleText({ book: 'Исход', chapter: 5 }, 'rst'));

      await waitFor(() => expect(result.current.text).toBe('Исход-5'));
      await waitFor(() => expect(getCachedText('Исход', 4, 'rst')).toBe('Исход-4'));
      await waitFor(() => expect(getCachedText('Исход', 6, 'rst')).toBe('Исход-6'));
    });

    it('navigator.onLine === false ⇒ getText для соседей не вызывается вовсе', async () => {
      // Текущая глава уже в memory-кеше — хук отдаёт её без похода в сеть (реалистичный
      // офлайн-сценарий с уже открытой главой), изолируя тест от circuit breaker'а
      // raceNetwork, который иначе тоже отклонил бы основной запрос при onLine=false.
      setCachedText('Числа', 10, 'rst', 'Числа-10');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });

      const { result } = renderHook(() => useBibleText({ book: 'Числа', chapter: 10 }, 'rst'));

      await waitFor(() => expect(result.current.text).toBe('Числа-10'));
      expect(getTextMock).not.toHaveBeenCalled();
      expect(getCachedText('Числа', 9, 'rst')).toBeUndefined();
      expect(getCachedText('Числа', 11, 'rst')).toBeUndefined();
    });

    it('зависший fetch соседа отваливается по таймауту, не мешая текущей главе', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
      vi.useFakeTimers();
      getTextMock.mockImplementation((book: string, chapter: number) => {
        if (chapter === 15) return Promise.resolve({ text: 'Левит-15', translation: 'rst' });
        return new Promise(() => {}); // сосед никогда не резолвится
      });

      const { result } = renderHook(() => useBibleText({ book: 'Левит', chapter: 15 }, 'rst'));

      await vi.waitFor(() => expect(result.current.text).toBe('Левит-15'));
      expect(result.current.loading).toBe(false);

      await vi.advanceTimersByTimeAsync(DEFAULT_NETWORK_TIMEOUT_MS + 1000);

      expect(result.current.text).toBe('Левит-15');
      expect(getCachedText('Левит', 14, 'rst')).toBeUndefined();
      vi.useRealTimers();
    });
  });
});
