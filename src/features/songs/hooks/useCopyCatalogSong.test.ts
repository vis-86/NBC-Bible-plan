// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const api = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock('@/shared/services/api/endpoints', () => ({ catalogApi: api }));
const refresh = vi.hoisted(() => ({ refreshAfterWrite: vi.fn() }));
vi.mock('./useSaveSong', () => refresh);

import { act } from 'react';
import { ApiClientError } from '@/shared/services/api/client';
import { useCopyCatalogSong } from './useCopyCatalogSong';

async function run(id = '9') {
  const { result } = renderHook(() => useCopyCatalogSong());
  let out: Awaited<ReturnType<typeof result.current.copy>> | undefined;
  await act(async () => {
    out = await result.current.copy(id);
  });
  return out!;
}

describe('useCopyCatalogSong', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('201 — песня и список обновляются в IDB, возвращается id копии', async () => {
    api.copy.mockResolvedValue({ alreadyCopied: false, id: '42' });
    refresh.refreshAfterWrite.mockResolvedValue(undefined);
    expect(await run()).toEqual({ status: 'copied', id: '42' });
    expect(refresh.refreshAfterWrite).toHaveBeenCalledWith('42');
  });

  it('409 — возвращает id существующей копии и обновляет IDB и список', async () => {
    api.copy.mockResolvedValue({ alreadyCopied: true, id: '7' });
    refresh.refreshAfterWrite.mockResolvedValue(undefined);
    expect(await run()).toEqual({ status: 'existing', id: '7' });
    expect(refresh.refreshAfterWrite).toHaveBeenCalledWith('7');
  });

  it('404 — песня больше недоступна', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.copy.mockRejectedValue(new ApiClientError('Not found', 404));
    expect(await run()).toEqual({ status: 'gone' });
  });

  it('сетевой сбой — сообщение об ошибке', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.copy.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await run()).toMatchObject({ status: 'error' });
  });
});
