// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { ReadingPlanDay } from '@/types';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { TodayReadingCard } from './TodayReadingCard';

function makeDay(): ReadingPlanDay {
  return {
    id: 1,
    dateStr: '2026-07-09',
    items: [
      { id: 1, dayNumber: 1, dateStr: '2026-07-09', readText: 'Быт. 1', item: 1, completed: false },
    ],
    readings: [],
    completed: false,
    readCount: 0,
    totalItems: 1,
  };
}

function renderCard() {
  const onToggleItem = vi.fn().mockResolvedValue(undefined);
  const onSelectReading = vi.fn();
  const onStartReading = vi.fn();
  const onMarkAllRead = vi.fn().mockResolvedValue(undefined);

  render(
    <TodayReadingCard
      day={makeDay()}
      totalDays={365}
      isToday
      yearProgress={10}
      onToggleItem={onToggleItem}
      onSelectReading={onSelectReading}
      onStartReading={onStartReading}
      onMarkAllRead={onMarkAllRead}
    />
  );

  return { onToggleItem, onSelectReading, onStartReading, onMarkAllRead };
}

describe('TodayReadingCard — тап-зоны строки чтения', () => {
  it('клик по строке открывает чтение, не переключает чекбокс', () => {
    const { onSelectReading, onToggleItem } = renderCard();

    fireEvent.click(document.querySelector('[data-today-reading-card-item="1"]')!);

    expect(onSelectReading).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), { book: 'Бытие', chapter: 1 });
    expect(onToggleItem).not.toHaveBeenCalled();
  });

  it('клик по чекбоксу переключает прогресс, не открывает чтение', () => {
    const { onSelectReading, onToggleItem } = renderCard();

    const checkbox = document.querySelector('[data-today-reading-card-item-checkbox="1"]')!;
    fireEvent.click(checkbox);

    expect(onToggleItem).toHaveBeenCalledWith(1, 1);
    expect(onSelectReading).not.toHaveBeenCalled();
  });

  it('клик по текст-кнопке открывает чтение ровно один раз', () => {
    const { onSelectReading } = renderCard();

    const link = document.querySelector('[data-today-reading-card-item-link="1"]')!;
    fireEvent.click(link);

    expect(onSelectReading).toHaveBeenCalledTimes(1);
  });

  it('чекбокс остаётся элементом input[type="checkbox"] (E2E-контракт)', () => {
    renderCard();

    const checkbox = document.querySelector('[data-today-reading-card-item-checkbox="1"]');
    expect(checkbox).toBeInstanceOf(HTMLInputElement);
    expect((checkbox as HTMLInputElement).type).toBe('checkbox');
  });
});
