// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSetlistDraft, SETLIST_DRAFT_STORAGE_KEY, SETLIST_DRAFT_TTL_MS } from './useSetlistDraft';

/** Кладёт запись в том же формате, что и хук: черновик + `savedAt` (без него запись невалидна). */
function storeDraft(draft: Record<string, unknown>, savedAt: number = Date.now()): void {
  localStorage.setItem(SETLIST_DRAFT_STORAGE_KEY, JSON.stringify({ ...draft, savedAt }));
}

describe('useSetlistDraft', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('toggleSong добавляет/убирает id, сохраняя порядок добавления', () => {
    const { result } = renderHook(() => useSetlistDraft());
    act(() => result.current.toggleSong(3));
    act(() => result.current.toggleSong(1));
    expect(result.current.draft.songIds).toEqual([3, 1]);
    act(() => result.current.toggleSong(3));
    expect(result.current.draft.songIds).toEqual([1]);
  });

  it('черновик переживает перемонтирование (persist в localStorage)', () => {
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

  it('битый JSON в localStorage не роняет экран — фолбэк на пустой черновик', () => {
    localStorage.setItem(SETLIST_DRAFT_STORAGE_KEY, '{not valid json');
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
    storeDraft({ songIds: [], title: 'Вск. Служение', date: '2026-08-02', step: 'confirm' });
    const { result } = renderHook(() => useSetlistDraft());
    expect(result.current.draft.step).toBe('pick');
  });

  it('битое значение step в localStorage → pick', () => {
    storeDraft({ songIds: [1], title: '', date: null, step: 'whatever' });
    const { result } = renderHook(() => useSetlistDraft());
    expect(result.current.draft.step).toBe('pick');
  });

  it('clear сбрасывает черновик в памяти и удаляет запись из localStorage', () => {
    const { result } = renderHook(() => useSetlistDraft());
    act(() => result.current.toggleSong(9));
    expect(localStorage.getItem(SETLIST_DRAFT_STORAGE_KEY)).not.toBeNull();

    act(() => result.current.clear());

    expect(result.current.draft.songIds).toEqual([]);
    expect(result.current.draft.title).toBe('');
    // Пустой черновик не хранится вовсе — иначе следующий заход поднимал бы пустышку.
    expect(localStorage.getItem(SETLIST_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('черновик старше TTL отбрасывается вместе с записью', () => {
    storeDraft({ songIds: [1, 2], title: 'Старый', date: null, step: 'pick' }, Date.now() - SETLIST_DRAFT_TTL_MS - 1);

    const { result } = renderHook(() => useSetlistDraft());

    expect(result.current.draft.songIds).toEqual([]);
    expect(result.current.restoredAt).toBeNull();
    expect(localStorage.getItem(SETLIST_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('свежий непустой черновик восстанавливается и отдаёт restoredAt для плашки', () => {
    const savedAt = Date.now() - 60_000;
    storeDraft({ songIds: [4], title: 'Вчерашний', date: null, step: 'pick' }, savedAt);

    const { result } = renderHook(() => useSetlistDraft());

    expect(result.current.draft.songIds).toEqual([4]);
    expect(result.current.restoredAt).toBe(savedAt);

    act(() => result.current.dismissRestored());
    // Плашка скрыта, но сам черновик остаётся — пользователь продолжает набор.
    expect(result.current.restoredAt).toBeNull();
    expect(result.current.draft.songIds).toEqual([4]);
  });

  it('черновик без единой песни не восстанавливается (дефолты названия/даты — не черновик)', () => {
    storeDraft({ songIds: [], title: 'Вск. Служение 02.08.2026', date: '2026-08-02', step: 'pick' });

    const { result } = renderHook(() => useSetlistDraft());

    expect(result.current.restoredAt).toBeNull();
  });

  it('открытие экрана без правок не пишет запись и не продлевает TTL', () => {
    const savedAt = Date.now() - 60_000;
    storeDraft({ songIds: [4], title: '', date: null, step: 'pick' }, savedAt);

    const { unmount } = renderHook(() => useSetlistDraft());
    unmount();

    const stored = JSON.parse(localStorage.getItem(SETLIST_DRAFT_STORAGE_KEY) as string);
    expect(stored.savedAt).toBe(savedAt);
  });
});
