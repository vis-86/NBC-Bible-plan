// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/shared/services/api/endpoints', () => ({ catalogApi: api }));

import { ApiClientError } from '@/shared/services/api/client';
import { useCatalog } from './useCatalog';

describe('useCatalog', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('грузит список из сети', async () => {
    const songs = [{ id: '5', title: 'Песня', teamName: 'Команда' }];
    api.list.mockResolvedValue({ songs });
    const { result } = renderHook(() => useCatalog());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', songs }));
  });

  it('заведомый офлайн — без запроса', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useCatalog());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'offline' }));
    expect(api.list).not.toHaveBeenCalled();
  });

  it('сетевой отказ — состояние error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.list.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useCatalog());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  it('403 — нет доступа', async () => {
    api.list.mockRejectedValue(new ApiClientError('Forbidden', 403));
    const { result } = renderHook(() => useCatalog());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'forbidden' }));
  });
});
