// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSetlistDraft, SETLIST_DRAFT_STORAGE_KEY } from './useSetlistDraft';

describe('useSetlistDraft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    sessionStorage.clear();
  });

  it('toggleSong добавляет/убирает id, сохраняя порядок добавления', () => {
    const { result } = renderHook(() => useSetlistDraft());
    act(() => result.current.toggleSong(3));
    act(() => result.current.toggleSong(1));
    expect(result.current.draft.songIds).toEqual([3, 1]);
    act(() => result.current.toggleSong(3));
    expect(result.current.draft.songIds).toEqual([1]);
  });

  it('черновик переживает перемонтирование (persist в sessionStorage)', () => {
    const first = renderHook(() => useSetlistDraft());
    act(() => {
      first.result.current.toggleSong(5);
      first.result.current.setTitle('Воскресное');
    });
    first.unmount();

    const second = renderHook(() => useSetlistDraft());
    expect(second.result.current.draft.songIds).toEqual([5]);
    expect(second.result.current.draft.title).toBe('Воскресное');
  });

  it('битый JSON в sessionStorage не роняет экран — фолбэк на пустой черновик', () => {
    sessionStorage.setItem(SETLIST_DRAFT_STORAGE_KEY, '{not valid json');
    const { result } = renderHook(() => useSetlistDraft());
    expect(result.current.draft.songIds).toEqual([]);
    expect(result.current.draft.title).toBe('');
  });

  it('moveSong меняет местами позиции, не выходит за границы', () => {
    const { result } = renderHook(() => useSetlistDraft());
    act(() => {
      result.current.toggleSong(1);
      result.current.toggleSong(2);
      result.current.toggleSong(3);
    });
    act(() => result.current.moveSong(0, 1));
    expect(result.current.draft.songIds).toEqual([2, 1, 3]);
    act(() => result.current.moveSong(0, -1)); // уже первый — no-op
    expect(result.current.draft.songIds).toEqual([2, 1, 3]);
    act(() => result.current.moveSong(2, 1)); // уже последний — no-op
    expect(result.current.draft.songIds).toEqual([2, 1, 3]);
  });

  it('clear сбрасывает черновик в памяти и в sessionStorage', () => {
    const { result } = renderHook(() => useSetlistDraft());
    act(() => result.current.toggleSong(9));
    act(() => result.current.clear());
    expect(result.current.draft.songIds).toEqual([]);
    expect(result.current.draft.title).toBe('');
    // clear() удаляет ключ, но persist-эффект тут же перезаписывает текущим (уже пустым)
    // состоянием — итог совпадает с фолбэком «нет записи» по содержимому.
    const stored = sessionStorage.getItem(SETLIST_DRAFT_STORAGE_KEY);
    expect(stored ? JSON.parse(stored) : null).toEqual({ songIds: [], title: '', date: null, editingId: null });
  });
});
