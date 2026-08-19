// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetlistSummary } from '../types';

const { readSWRMock, refreshMock } = vi.hoisted(() => ({
  readSWRMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('../lib/offlineSetlists', () => ({
  readSetlistsThroughSWR: readSWRMock,
  refreshSetlistsFromNetwork: refreshMock,
}));

import { resetSetlistsCache, useSetlists } from './useSetlists';

const OLD: SetlistSummary = { id: 's1', title: 'Старый', date: null, items: [] };
const FRESH: SetlistSummary = { id: 's2', title: 'Свежий', date: null, items: [] };

/** Смонтировать хук и дождаться конца первичной загрузки. */
async function renderLoaded() {
  const view = renderHook(() => useSetlists());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useSetlists.refresh', () => {
  beforeEach(() => {
    resetSetlistsCache();
    readSWRMock.mockReset();
    refreshMock.mockReset();
    readSWRMock.mockResolvedValue({ setlists: [OLD], fromCache: true });
  });

  it('успешный refresh заменяет список и обновляет module-кэш', async () => {
    refreshMock.mockResolvedValueOnce([FRESH]);
    const { result, unmount } = await renderLoaded();
    expect(result.current.setlists).toEqual([OLD]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.setlists).toEqual([FRESH]);
    expect(result.current.refreshError).toBeNull();
    unmount();

    // Второй монтаж стартует уже со свежими данными и в сеть не идёт.
    readSWRMock.mockClear();
    const second = renderHook(() => useSetlists());
    expect(second.result.current.setlists).toEqual([FRESH]);
    expect(second.result.current.loading).toBe(false);
    expect(readSWRMock).not.toHaveBeenCalled();
  });

  it('ошибка refresh -> refreshError заполнен, список прежний', async () => {
    refreshMock.mockRejectedValueOnce(new Error('Нет сети. Список не обновлён'));
    const { result } = await renderLoaded();

    await act(async () => {
      // Промис резолвится в обоих исходах — жест не должен ловить исключение.
      await expect(result.current.refresh()).resolves.toBeUndefined();
    });

    expect(result.current.refreshError).toBe('Нет сети. Список не обновлён');
    expect(result.current.setlists).toEqual([OLD]);
    expect(result.current.refreshing).toBe(false);
  });

  it('повторный вызов во время refreshing -> второго обращения к сети нет', async () => {
    let release: (v: SetlistSummary[]) => void = () => {};
    refreshMock.mockImplementationOnce(() => new Promise<SetlistSummary[]>((r) => (release = r)));
    const { result } = await renderLoaded();

    let first: Promise<void>;
    act(() => {
      first = result.current.refresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(true));

    await act(async () => {
      await result.current.refresh();
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release([FRESH]);
      await first;
    });
    expect(result.current.setlists).toEqual([FRESH]);
  });

  it('refresh во время первичной загрузки не молчит: ошибка доходит до UI', async () => {
    // Гонка прод-контура: стартовое чтение ещё висит (медленный Directus), а
    // пользователь уже потянул список офлайн. Раньше жест пропускался — спиннер
    // отрабатывал вхолостую, «Нет сети» не появлялось (e2e setlists-offline.spec.ts:166).
    readSWRMock.mockImplementationOnce(
      () => new Promise<SetlistSummary[]>((r) => setTimeout(() => r([OLD]), 20))
    );
    refreshMock.mockRejectedValueOnce(new Error('Нет сети. Список не обновлён'));

    const { result } = renderHook(() => useSetlists());
    expect(result.current.loading).toBe(true);

    await act(async () => {
      await result.current.refresh();
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(result.current.refreshError).toBe('Нет сети. Список не обновлён');

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('опоздавшая первичная загрузка не затирает данные удавшегося refresh', async () => {
    readSWRMock.mockImplementationOnce(
      () => new Promise<SetlistSummary[]>((r) => setTimeout(() => r([OLD]), 20))
    );
    refreshMock.mockResolvedValueOnce([FRESH]);

    const { result } = renderHook(() => useSetlists());

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.setlists).toEqual([FRESH]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setlists).toEqual([FRESH]);
    expect(result.current.error).toBeNull();
  });
});

describe('useSetlists — SWR-состояние и resetSetlistsCache', () => {
  beforeEach(() => {
    resetSetlistsCache();
    readSWRMock.mockReset();
    refreshMock.mockReset();
  });

  it('свежий список фоновой ревалидации применяется молча', async () => {
    let emitFresh: ((list: SetlistSummary[]) => void) | undefined;
    readSWRMock.mockImplementation((options) => {
      emitFresh = options?.onFresh;
      return Promise.resolve({ setlists: [OLD], fromCache: true });
    });

    const { result } = await renderLoaded();
    expect(result.current.setlists).toEqual([OLD]);

    await act(async () => {
      emitFresh?.([FRESH]);
    });

    expect(result.current.setlists).toEqual([FRESH]);
  });

  it('resetSetlistsCache гасит SWR-состояние: поздняя ревалидация не возвращает удалённый сет', async () => {
    let emitFresh: ((list: SetlistSummary[]) => void) | undefined;
    readSWRMock.mockImplementation((options) => {
      emitFresh = options?.onFresh;
      return Promise.resolve({ setlists: [OLD], fromCache: true });
    });

    const { result } = await renderLoaded();

    // Мутация сета -> сброс кэша; ревалидация со старым составом опоздала.
    resetSetlistsCache();
    await act(async () => {
      emitFresh?.([OLD, FRESH]);
    });

    expect(result.current.setlists).toEqual([OLD]);
  });
});
