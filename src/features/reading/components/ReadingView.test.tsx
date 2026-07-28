// @vitest-environment jsdom
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReadingPlanDay, PlanItem } from '@/types';

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

vi.mock('../hooks/useReadingSettings', () => ({
  useReadingSettings: () => ({
    settings: { theme: 'system', ot_translation: 'rst', nt_translation: 'rst', verse_per_line: false },
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('../hooks/useBibleText', () => ({
  useBibleText: () => ({ text: 'текст главы', loading: false }),
}));

vi.mock('@/shared/hooks/useStatusBarColor', () => ({
  useStatusBarColor: () => {},
}));

let scrollHidden = false;
vi.mock('@/shared/hooks/useScrollDirection', () => ({
  useScrollDirection: () => ({ hidden: scrollHidden, setHidden: vi.fn(), ignoreNextScroll: vi.fn() }),
}));

vi.mock('./ReadingHeader', () => ({ ReadingHeader: () => <div data-reading-header /> }));
vi.mock('./ReadingContent', () => ({ ReadingContent: () => <div data-reading-content /> }));
vi.mock('./ReadingSettings', () => ({ ReadingSettings: () => null }));
vi.mock('./ChapterPicker', () => ({ ChapterPicker: () => null }));
vi.mock('./BookPicker', () => ({ BookPicker: () => null }));
vi.mock('./CompletionModal', () => ({
  CompletionModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-completion-modal-open /> : null),
}));
vi.mock('./FloatingChapterNav', () => ({ FloatingChapterNav: () => <div data-floating-nav /> }));

import { ChromeVisibilityProvider } from '@/shared/components/layout/ChromeVisibility';
import { ReadingView } from './ReadingView';

function fireSwipe(el: Element, startX: number, endX: number, y = 100) {
  fireEvent.pointerDown(el, { clientX: startX, clientY: y });
  fireEvent.pointerMove(el, { clientX: endX, clientY: y });
  fireEvent.pointerUp(el, { clientX: endX, clientY: y });
}

function renderReadingView(props: Partial<React.ComponentProps<typeof ReadingView>> = {}) {
  const onBack = vi.fn();
  const onChapterRead = vi.fn();
  const onNavigateChapter = vi.fn();
  const utils = render(
    <ChromeVisibilityProvider>
      <ReadingView
        reading={{ book: 'Бытие', chapter: 1 }}
        onBack={onBack}
        day={null}
        {...props}
      />
    </ChromeVisibilityProvider>
  );
  return { ...utils, onBack, onChapterRead, onNavigateChapter };
}

describe('ReadingView — свайп между главами (Task 9)', () => {
  beforeEach(() => {
    scrollHidden = false;
  });

  it('свайп внутри дня вызывает те же обработчики, что кнопка ›: отмечает главу и листает к следующему item', () => {
    const items: PlanItem[] = [
      { id: 1, dayNumber: 1, dateStr: '2026-01-01', readText: 'Бытие 1', item: 1, completed: false },
      { id: 2, dayNumber: 1, dateStr: '2026-01-01', readText: 'Бытие 2', item: 2, completed: false },
    ];
    const day: ReadingPlanDay = {
      id: 1,
      dateStr: '2026-01-01',
      items,
      readings: [],
      completed: false,
      readCount: 0,
      totalItems: 2,
    };
    const onChapterRead = vi.fn();
    const onNavigateChapter = vi.fn();
    const { container } = renderReadingView({
      day,
      currentItem: items[0],
      onChapterRead,
      onNavigateChapter,
    });

    const pager = container.querySelector('[data-swipe-pager]') as HTMLElement;
    fireSwipe(pager, 200, 80);

    // handleNextChapter отмечает текущую главу и передаёт навигацию наверх —
    // ровно то же самое, что делает кнопка › в FloatingChapterNav.
    expect(onChapterRead).toHaveBeenCalledWith(1, 1);
    expect(onNavigateChapter).toHaveBeenCalledWith('Бытие', 2, 1, 2);
  });

  it('свайп влево на последней главе дня открывает CompletionModal (тот же путь, что кнопка ✓)', () => {
    const items: PlanItem[] = [
      { id: 1, dayNumber: 1, dateStr: '2026-01-01', readText: 'Бытие 1', item: 1, completed: true },
      { id: 2, dayNumber: 1, dateStr: '2026-01-01', readText: 'Бытие 2', item: 2, completed: false },
    ];
    const day: ReadingPlanDay = {
      id: 1,
      dateStr: '2026-01-01',
      items,
      readings: [],
      completed: false,
      readCount: 1,
      totalItems: 2,
    };
    const { container } = renderReadingView({
      reading: { book: 'Бытие', chapter: 2 },
      day,
      currentItem: items[1],
    });

    const pager = container.querySelector('[data-swipe-pager]') as HTMLElement;
    fireSwipe(pager, 200, 80);

    expect(container.querySelector('[data-completion-modal-open]')).toBeTruthy();
  });

  it('на главе 1 свайп вправо — мёртвый край: ни перехода, ни подсказки', () => {
    const onNavigateChapter = vi.fn();
    const { container } = renderReadingView({
      reading: { book: 'Бытие', chapter: 1 },
      day: null,
      onNavigateChapter,
    });

    const pager = container.querySelector('[data-swipe-pager]') as HTMLElement;
    fireSwipe(pager, 80, 200);

    expect(onNavigateChapter).not.toHaveBeenCalled();
    expect(container.querySelector('[data-pager-hint]')).toBeNull();
  });

  it('в плане свайп за последнюю главу дня обещает «Завершить», а не край', () => {
    const items: PlanItem[] = [
      { id: 1, dayNumber: 1, dateStr: '2026-01-01', readText: 'Бытие 1', item: 1, completed: true },
      { id: 2, dayNumber: 1, dateStr: '2026-01-01', readText: 'Бытие 2', item: 2, completed: false },
    ];
    const day: ReadingPlanDay = {
      id: 1,
      dateStr: '2026-01-01',
      items,
      readings: [],
      completed: false,
      readCount: 1,
      totalItems: 2,
    };
    const { container } = renderReadingView({
      reading: { book: 'Бытие', chapter: 2 },
      day,
      currentItem: items[1],
    });

    const pager = container.querySelector('[data-swipe-pager]') as HTMLElement;
    // Только тянем влево, не отпуская: подсказка обязана появиться ДО коммита.
    fireEvent.pointerDown(pager, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(pager, { clientX: 120, clientY: 100 });

    expect(container.querySelector('[data-pager-hint-action]')).toBeTruthy();
    expect(screen.getByText('Завершить')).toBeInTheDocument();
  });
});
