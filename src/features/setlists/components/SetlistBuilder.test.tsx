// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SongSummary } from '@/features/songs/types';

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, prefetch: vi.fn() }),
}));

let matchesWide = false;
vi.mock('@/shared/hooks/useMediaQuery', () => ({
  useMediaQuery: () => matchesWide,
}));

vi.mock('@/features/setlists/lib/offlineSetlists', () => ({
  setlistCacheKey: (id: string) => `setlists:item:${id}`,
  SETLISTS_LIST_CACHE_KEY: 'setlists:list',
}));

vi.mock('@/shared/offline/db', () => ({
  getDB: async () => ({ delete: vi.fn() }),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  setlistsApi: { create: vi.fn(), update: vi.fn() },
}));

import { SetlistBuilder } from './SetlistBuilder';

const SONGS: SongSummary[] = [
  { id: '1', title: 'Господь мой пастырь', key: 'G' },
  { id: '2', title: 'Свят, свят, свят' },
  { id: '3', title: 'Аллилуйя' },
];

function pickRow(container: Element, title: string): HTMLElement {
  return Array.from(container.querySelectorAll('[data-setlist-builder-pick-row]')).find((el) =>
    el.textContent?.includes(title)
  ) as HTMLElement;
}

describe('SetlistBuilder', () => {
  beforeEach(() => {
    localStorage.clear();
    matchesWide = false;
  });
  afterEach(() => {
    vi.clearAllMocks();
    // Спай на `navigator.onLine` — геттер прототипа: без restore он утечёт в соседние тесты.
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('тап по строке добавляет chip и ставит aria-selected', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    const row = pickRow(container, 'Господь мой пастырь');
    expect(row.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(row);

    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-setlist-builder-chip]')).toBeTruthy();
    expect(screen.getByText('Выбрано: 1')).toBeTruthy();
  });

  it('✕ на chip снимает выбор и синхронно снимает галку в списке', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));
    expect(container.querySelectorAll('[data-setlist-builder-chip]')).toHaveLength(1);

    fireEvent.click(container.querySelector('[data-setlist-builder-chip]') as HTMLElement);

    expect(container.querySelectorAll('[data-setlist-builder-chip]')).toHaveLength(0);
    expect(pickRow(container, 'Аллилуйя').getAttribute('aria-selected')).toBe('false');
  });

  it('FAB «Далее» disabled при N=0, активен при N≥1', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    const fab = container.querySelector('[data-setlist-builder-next]') as HTMLButtonElement;
    expect(fab.disabled).toBe(true);

    fireEvent.click(pickRow(container, 'Свят'));
    expect(fab.disabled).toBe(false);
  });

  it('битый JSON в localStorage не роняет экран билдера', () => {
    localStorage.setItem('setlists:draft', '{broken');
    expect(() => render(<SetlistBuilder songs={SONGS} />)).not.toThrow();
  });

  it('восстановленный черновик показывает плашку, «Начать заново» очищает выбор', () => {
    localStorage.setItem(
      'setlists:draft',
      JSON.stringify({ songIds: [3], title: 'Вчерашний', date: null, step: 'pick', savedAt: Date.now() - 60_000 })
    );
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    expect(container.querySelector('[data-setlist-builder-restored]')).toBeTruthy();
    expect(pickRow(container, 'Аллилуйя').getAttribute('aria-selected')).toBe('true');

    fireEvent.click(container.querySelector('[data-setlist-builder-restored-reset]') as HTMLElement);

    expect(container.querySelector('[data-setlist-builder-restored]')).toBeNull();
    expect(pickRow(container, 'Аллилуйя').getAttribute('aria-selected')).toBe('false');
    expect(localStorage.getItem('setlists:draft')).toBeNull();
  });

  it('✕ на плашке скрывает её, но черновик остаётся', () => {
    localStorage.setItem(
      'setlists:draft',
      JSON.stringify({ songIds: [3], title: '', date: null, step: 'pick', savedAt: Date.now() - 60_000 })
    );
    const { container } = render(<SetlistBuilder songs={SONGS} />);

    fireEvent.click(container.querySelector('[data-setlist-builder-restored-dismiss]') as HTMLElement);

    expect(container.querySelector('[data-setlist-builder-restored]')).toBeNull();
    expect(pickRow(container, 'Аллилуйя').getAttribute('aria-selected')).toBe('true');
  });

  it('новый заход без черновика плашку не показывает', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    expect(container.querySelector('[data-setlist-builder-restored]')).toBeNull();
  });

  // Регрессия: рукописная шапка не резервировала бровь (`pt-safe-*` есть только
  // у PageHeader) — на iPhone она уезжала под статус-бар и выход был недоступен.
  it('оба шага используют общую шапку PageHeader с кнопкой выхода', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = render(<SetlistBuilder songs={SONGS} />);

    const pickHeader = container.querySelector('[data-page-header]');
    expect(pickHeader).toBeTruthy();
    expect(screen.getByText('Выбрано: 0')).toBeTruthy();

    fireEvent.click(pickRow(container, 'Аллилуйя'));
    fireEvent.click(container.querySelector('[data-setlist-builder-next]') as HTMLElement);
    expect(container.querySelector('[data-setlist-confirm-step] [data-page-header]')).toBeTruthy();

    // Возврат на шаг выбора и выход через «назад» шапки — путь, которого не было на iPhone.
    fireEvent.click(container.querySelector('[data-setlist-confirm-step] [data-page-header-back]') as HTMLElement);
    fireEvent.click(container.querySelector('[data-page-header-back]') as HTMLElement);

    expect(confirmSpy).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/dashboard/setlists');
  });

  it('стрелок «Вверх»/«Вниз» больше нет — порядок задаётся только drag\'ом', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));
    fireEvent.click(container.querySelector('[data-setlist-builder-next]') as HTMLElement);

    expect(container.querySelector('[data-setlist-builder-item-up]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-item-down]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-item]')).toBeTruthy();
  });

  it('«Далее» преднаполняет название «Вск. Служение dd.mm.yyyy» и дату ближайшего воскресенья', () => {
    // 2026-07-27 — понедельник, ближайшее вс — 2026-08-02.
    // shouldAdvanceTime: иначе анимации Framer Motion виснут на замороженных таймерах.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 27, 12));
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));
    fireEvent.click(container.querySelector('[data-setlist-builder-next]') as HTMLElement);

    expect((container.querySelector('[data-setlist-builder-date-input]') as HTMLInputElement).value).toBe(
      '2026-08-02'
    );
    expect((container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement).value).toBe(
      'Вск. Служение 02.08.2026'
    );
  });

  it('«Назад» с шага подтверждения сохраняет выбор', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));
    fireEvent.click(container.querySelector('[data-setlist-builder-next]') as HTMLElement);
    fireEvent.click(container.querySelector('[data-setlist-confirm-step] [data-page-header-back]') as HTMLElement);

    expect(screen.getByText('Выбрано: 1')).toBeTruthy();
    expect(pickRow(container, 'Аллилуйя').getAttribute('aria-selected')).toBe('true');
  });

  it('восстановленный черновик со step=confirm показывает плашку и «Начать заново»', () => {
    localStorage.setItem(
      'setlists:draft',
      JSON.stringify({ songIds: [3], title: 'Вчерашний', date: null, step: 'confirm', savedAt: Date.now() - 60_000 })
    );
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    expect(container.querySelector('[data-setlist-confirm-step]')).toBeTruthy();
    expect(container.querySelector('[data-setlist-builder-restored]')).toBeTruthy();

    fireEvent.click(container.querySelector('[data-setlist-builder-restored-reset]') as HTMLElement);

    // Сброс опустошает состав ⇒ шаг подтверждения сменяется выбором песен.
    expect(container.querySelector('[data-setlist-confirm-step]')).toBeNull();
    expect(pickRow(container, 'Аллилуйя').getAttribute('aria-selected')).toBe('false');
  });

  it('✕ на шаге подтверждения выходит из билдера с подтверждением', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));
    fireEvent.click(container.querySelector('[data-setlist-builder-next]') as HTMLElement);

    fireEvent.click(container.querySelector('[data-setlist-confirm-cancel]') as HTMLElement);

    expect(confirmSpy).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/dashboard/setlists');
    expect(localStorage.getItem('setlists:draft')).toBeNull();
  });

  it('удаление последней песни на шаге подтверждения возвращает к выбору', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));
    fireEvent.click(container.querySelector('[data-setlist-builder-next]') as HTMLElement);
    expect(container.querySelector('[data-setlist-confirm-step]')).toBeTruthy();

    fireEvent.click(container.querySelector('[data-setlist-builder-item-remove]') as HTMLElement);

    expect(container.querySelector('[data-setlist-confirm-step]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-pick-list]')).toBeTruthy();
  });

  it('сегмент «Выбранные» сворачивает список до выбранного, не сбрасывая запрос', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    expect(container.querySelectorAll('[data-setlist-builder-pick-row]')).toHaveLength(3);

    fireEvent.click(pickRow(container, 'Аллилуйя'));
    fireEvent.click(container.querySelector('[data-setlist-builder-filter-option="selected"]') as HTMLElement);

    const rows = container.querySelectorAll('[data-setlist-builder-pick-row]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Аллилуйя');
  });

  it('сегмент «Выбранные» disabled, пока ничего не выбрано', () => {
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    const selectedTab = container.querySelector(
      '[data-setlist-builder-filter-option="selected"]'
    ) as HTMLButtonElement;
    expect(selectedTab.disabled).toBe(true);

    fireEvent.click(pickRow(container, 'Аллилуйя'));
    expect(selectedTab.disabled).toBe(false);
  });

  it('широкий layout (≥768px): рендерит панель и шапку со стрелкой «назад», не рендерит FAB «Далее»', () => {
    matchesWide = true;
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    expect(container.querySelector('[data-setlist-builder-next]')).toBeNull();
    expect(container.querySelector('[data-setlist-builder-submit-desktop]')).toBeTruthy();
    expect(container.querySelector('[data-page-header-back]')).toBeTruthy();
  });

  it('широкий layout: стрелка «назад» без выбора уходит к списку сетов без подтверждения', () => {
    matchesWide = true;
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(container.querySelector('[data-page-header-back]') as HTMLElement);

    expect(pushMock).toHaveBeenCalledWith('/dashboard/setlists');
  });

  it('широкий layout: название и дата преднаполнены дефолтами без шага «Далее»', () => {
    // 2026-07-27 — понедельник, ближайшее вс — 2026-08-02.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 27, 12));
    matchesWide = true;
    const { container } = render(<SetlistBuilder songs={SONGS} />);

    expect((container.querySelector('[data-setlist-builder-date-input]') as HTMLInputElement).value).toBe(
      '2026-08-02'
    );
    expect((container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement).value).toBe(
      'Вск. Служение 02.08.2026'
    );
  });

  it('широкий layout: офлайн показывает предупреждение и блокирует «Сохранить»', () => {
    matchesWide = true;
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fireEvent(window, new Event('offline'));

    expect(container.querySelector('[data-setlist-builder-offline-warning]')).toBeTruthy();
    expect((container.querySelector('[data-setlist-builder-submit-desktop]') as HTMLButtonElement).disabled).toBe(
      true
    );

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    fireEvent(window, new Event('online'));

    expect(container.querySelector('[data-setlist-builder-offline-warning]')).toBeNull();
    expect((container.querySelector('[data-setlist-builder-submit-desktop]') as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('широкий layout: очищенное вручную название не восстанавливается дефолтом', () => {
    matchesWide = true;
    const { container } = render(<SetlistBuilder songs={SONGS} />);
    const titleInput = container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: '' } });

    expect(titleInput.value).toBe('');
  });

  it('переключение ширины не теряет выбор (черновик общий для обоих режимов)', () => {
    const { container, rerender } = render(<SetlistBuilder songs={SONGS} />);
    fireEvent.click(pickRow(container, 'Аллилуйя'));

    matchesWide = true;
    rerender(<SetlistBuilder songs={SONGS} />);

    // Desktop-панель показывает reorder-список с той же выбранной песней.
    expect(container.querySelectorAll('[data-setlist-builder-item]')).toHaveLength(1);
    expect(container.querySelector('[data-setlist-builder-item]')?.textContent).toContain('Аллилуйя');

    fireEvent.change(container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement, {
      target: { value: 'Молодёжка' },
    });
    expect((container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement).value).toBe(
      'Молодёжка'
    );
  });
});
