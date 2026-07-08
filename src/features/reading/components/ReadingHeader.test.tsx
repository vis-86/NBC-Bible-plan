// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadingHeader } from './ReadingHeader';
import type { ReadingPlanDay, PlanItem } from '@/types';

const reading = { book: 'Иоанна', chapter: 3 };

const baseProps = {
  currentReading: reading,
  reading,
  currentChapter: 3,
  onSettingsClick: vi.fn(),
  onChapterPickerClick: vi.fn(),
  onBookPickerClick: vi.fn(),
};

const day: ReadingPlanDay = {
  id: 42,
  completed: false,
  items: [
    { id: 1, item: 1, readText: 'Иоанна 3', completed: false } as PlanItem,
    { id: 2, item: 2, readText: 'Иоанна 4', completed: false } as PlanItem,
  ],
} as unknown as ReadingPlanDay;

const currentItem: PlanItem = { id: 1, item: 1, readText: 'Иоанна 3', completed: false } as PlanItem;

describe('ReadingHeader', () => {
  it('не рендерит стрелку назад', () => {
    render(<ReadingHeader {...baseProps} day={null} />);
    expect(screen.queryByTestId('reading-header-back-button')).not.toBeInTheDocument();
  });

  it('бейдж «День N · X из Y» при day + currentItem', () => {
    render(<ReadingHeader {...baseProps} day={day} currentItem={currentItem} totalItems={2} />);
    expect(screen.getByTestId('reading-header-plan-badge')).toHaveTextContent('День 42 · 1 из 2');
  });

  it('бейдж «День N» без счётчика при day без currentItem', () => {
    render(<ReadingHeader {...baseProps} day={day} currentItem={null} />);
    const badge = screen.getByTestId('reading-header-plan-badge');
    expect(badge).toHaveTextContent('День 42');
    expect(badge).not.toHaveTextContent('из');
  });

  it('бейдж отсутствует без day (свободное чтение)', () => {
    render(<ReadingHeader {...baseProps} day={null} />);
    expect(screen.queryByTestId('reading-header-plan-badge')).not.toBeInTheDocument();
  });
});
