// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ReadingPlanDay } from '@/types';
import { CalendarView } from './CalendarView';

beforeEach(() => {
  // jsdom не реализует scrollIntoView — календарь вызывает его при монтировании.
  Element.prototype.scrollIntoView = vi.fn();
});

// День 1 = 1 января (day-of-year 1). Первая глава прочитана, вторая — нет,
// поэтому «перейти к чтению» должно открыть именно вторую главу.
const plan: ReadingPlanDay[] = [
  {
    id: 1,
    dateStr: '2026-01-01',
    completed: false,
    readCount: 1,
    totalItems: 2,
    readings: [
      { book: 'Быт', chapter: 1 },
      { book: 'Быт', chapter: 2 },
    ],
    items: [
      { id: 11, dayNumber: 1, dateStr: '2026-01-01', readText: 'Быт. 1', item: 1, completed: true },
      { id: 12, dayNumber: 1, dateStr: '2026-01-01', readText: 'Быт. 2', item: 2, completed: false },
    ],
  },
];

function renderView(overrides: Partial<React.ComponentProps<typeof CalendarView>> = {}) {
  const props = {
    plan,
    onSelectReading: vi.fn(),
    onToggleComplete: vi.fn().mockResolvedValue(undefined),
    onToggleItem: vi.fn().mockResolvedValue(undefined),
    onToggleCompleteMany: vi.fn().mockResolvedValue(undefined),
    onBack: vi.fn(),
    ...overrides,
  };
  render(<CalendarView {...props} />);
  return props;
}

describe('CalendarView — переход к чтению из попапа выбранных дней', () => {
  it('клик по кнопке дня вызывает onSelectReading с первой непрочитанной главой и закрывает попап', () => {
    const props = renderView();

    // Выбираем день 1 — открывается BottomSheet «Действия с выбранными днями».
    const cube = document.querySelector('[data-day-nav-cube="1"]') as HTMLElement;
    expect(cube).toBeTruthy();
    fireEvent.click(cube);

    const navButton = screen.getByLabelText('Перейти к чтению дня 1');
    fireEvent.click(navButton);

    // Первая непрочитанная глава дня — «Быт. 2» → { book: 'Бытие', chapter: 2 }.
    expect(props.onSelectReading).toHaveBeenCalledTimes(1);
    expect(props.onSelectReading).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      { book: 'Бытие', chapter: 2 }
    );

    // Попап закрылся после перехода.
    expect(screen.queryByLabelText('Перейти к чтению дня 1')).toBeNull();
  });
});
