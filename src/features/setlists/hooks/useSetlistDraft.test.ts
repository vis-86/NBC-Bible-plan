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

  it('reorderSongs заменяет порядок целиком (drag-reorder)', () => {
    const { result } = renderHook(() => useSetlistDraft());
    act(() => {
      result.current.toggleSong(1);
      result.current.toggleSong(2);
      result.current.toggleSong(3);
    });
    act(() => result.current.reorderSongs([3, 1, 2]));
    expect(result.current.draft.songIds).toEqual([3, 1, 2]);
  });

  it('reorderSongs игнорирует не-перестановку (песня не резолвится в каталоге — не теряем её)', () => {
    const { result } = renderHook(() => useSetlistDraft());
    act(() => {
      result.current.toggleSong(1);
      result.current.toggleSong(2);
      result.current.toggleSong(3);
    });
    // Билдер отфильтровал id=2 (нет в загруженном списке песен) и прислал усечённый порядок.
    act(() => result.current.reorderSongs([3, 1]));
    expect(result.current.draft.songIds).toEqual([1, 2, 3]);
    // Чужой id тоже не проходит.
    act(() => result.current.reorderSongs([3, 1, 99]));
    expect(result.current.draft.songIds).toEqual([1, 2, 3]);
  });

  it('step переживает перемонтирование вместе с остальным черновиком', () => {
    const first = renderHook(() => useSetlistDraft());
    act(() => first.result.current.toggleSong(7));
    act(() => first.result.current.setStep('confirm'));
    expect(first.result.current.draft.step).toBe('confirm');
    first.unmount();

    const second = renderHook(() => useSetlistDraft());
    expect(second.result.current.draft.step).toBe('confirm');
  });

  it('setStep("confirm") без выбранных песен отклоняется (иначе экран подтверждения пустой)', () => {
    const { result } = renderHook(() => useSetlistDraft());
    act(() => result.current.setStep('confirm'));
    expect(result.current.draft.step).toBe('pick');
  });

  it('сохранённый step="confirm" с пустым составом откатывается на pick при чтении', () => {
    sessionStorage.setItem(
      SETLIST_DRAFT_STORAGE_KEY,
      JSON.stringify({ songIds: [], title: 'Вск. Служение', date: '2026-08-02', step: 'confirm' })
    );
    const { result } = renderHook(() => useSetlistDraft());
    expect(result.current.draft.step).toBe('pick');
  });

  it('битое значение step в sessionStorage → pick', () => {
    sessionStorage.setItem(
      SETLIST_DRAFT_STORAGE_KEY,
      JSON.stringify({ songIds: [1], title: '', date: null, step: 'whatever' })
    );
    const { result } = renderHook(() => useSetlistDraft());
    expect(result.current.draft.step).toBe('pick');
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
    expect(stored ? JSON.parse(stored) : null).toEqual({ songIds: [], title: '', date: null, step: 'pick' });
  });
});
