// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ getSong: vi.fn() }));
vi.mock('@/shared/services/api/endpoints', () => ({ songsApi: api }));

import { ApiClientError } from '@/shared/services/api/client';
import { useSongForEdit } from './useSongForEdit';

describe('useSongForEdit', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('создание (id = null) — грузить нечего', () => {
    const { result } = renderHook(() => useSongForEdit(null));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(api.getSong).not.toHaveBeenCalled();
  });

  it('грузит песню из сети', async () => {
    const song = { id: '7', title: 'Песня', content: '[G]Слово' };
    api.getSong.mockResolvedValue({ song });
    const { result } = renderHook(() => useSongForEdit('7'));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', song }));
  });

  it('заведомый офлайн — сразу «нужен интернет», без ожидания сети', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useSongForEdit('7'));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'offline' }));
    expect(api.getSong).not.toHaveBeenCalled();
  });

  it('404 — песню удалили', async () => {
    api.getSong.mockRejectedValue(new ApiClientError('Not found', 404));
    const { result } = renderHook(() => useSongForEdit('7'));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(result.current.state).toMatchObject({ message: expect.stringContaining('не найдена') });
  });
});
