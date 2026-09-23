// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), getSong: vi.fn() }));
vi.mock('@/shared/services/api/endpoints', () => ({ songsApi: api }));

const persistCachedSong = vi.hoisted(() => vi.fn());
vi.mock('../lib/offlineSongs', () => ({ persistCachedSong }));

const rememberSong = vi.hoisted(() => vi.fn());
vi.mock('./useSong', () => ({ rememberSong }));

const refreshSongsList = vi.hoisted(() => vi.fn());
vi.mock('./useSongs', () => ({ refreshSongsList }));

import { ApiClientError } from '@/shared/services/api/client';
import { NetworkTimeoutError } from '@/shared/offline/networkTimeout';
import { saveErrorMessage, useSaveSong } from './useSaveSong';

const PAYLOAD = { title: 'Песня', songKey: null, tempo: null, time: null, content: '[G]Слово' };
const FRESH = { id: '42', title: 'Песня', content: '[G]Слово' };

describe('useSaveSong', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('создание: после записи свежая песня уходит в IDB и память, список обновляется', async () => {
    api.create.mockResolvedValue({ id: 42 });
    api.getSong.mockResolvedValue({ song: FRESH });
    refreshSongsList.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSaveSong());

    let id: string | null = null;
    await act(async () => {
      id = await result.current.create(PAYLOAD);
    });

    expect(id).toBe('42');
    expect(api.getSong).toHaveBeenCalledWith('42');
    expect(persistCachedSong).toHaveBeenCalledWith(FRESH);
    expect(rememberSong).toHaveBeenCalledWith(FRESH);
    expect(refreshSongsList).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('сбой обновления кешей не превращает успешную запись в ошибку', async () => {
    api.update.mockResolvedValue(undefined);
    api.getSong.mockRejectedValue(new Error('network'));
    refreshSongsList.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useSaveSong());

    let id: string | null = null;
    await act(async () => {
      id = await result.current.update('7', { tempo: 80 });
    });

    expect(api.update).toHaveBeenCalledWith('7', { tempo: 80 });
    expect(id).toBe('7');
    expect(result.current.error).toBeNull();
  });

  it('ошибка записи → null и понятный текст, кеши не трогаются', async () => {
    api.update.mockRejectedValue(new ApiClientError('Forbidden', 403));
    const { result } = renderHook(() => useSaveSong());

    let id: string | null = 'x';
    await act(async () => {
      id = await result.current.update('7', { tempo: 80 });
    });

    expect(id).toBeNull();
    expect(result.current.error).toBe('Недостаточно прав для правки песен.');
    expect(result.current.submitting).toBe(false);
    expect(persistCachedSong).not.toHaveBeenCalled();
  });
});

describe('saveErrorMessage', () => {
  it('400 — текст валидации сервера как есть', () => {
    expect(saveErrorMessage(new ApiClientError('Название обязательно', 400))).toBe('Название обязательно');
  });

  it('404 — песню удалили', () => {
    expect(saveErrorMessage(new ApiClientError('Not found', 404))).toContain('не найдена');
  });

  it('таймаут — предупреждает о возможном дубле, а не зовёт повторить', () => {
    expect(saveErrorMessage(new NetworkTimeoutError(20_000))).toContain('прежде чем повторять');
  });

  it('500 и прочее — общий текст без внутренностей сервера', () => {
    expect(saveErrorMessage(new ApiClientError('Internal server error', 500))).toBe('Не удалось сохранить. Попробуйте ещё раз.');
  });
});
