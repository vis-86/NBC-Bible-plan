import { describe, it, expect, vi } from 'vitest';

import { ReadingPlanDay } from '@/types';
import { getDayFirstReading } from './bible';

const baseDay = (over: Partial<ReadingPlanDay>): ReadingPlanDay => ({
  id: 1,
  dateStr: '2026-01-01',
  completed: false,
  readCount: 0,
  totalItems: 0,
  readings: [],
  items: [],
  ...over,
});

describe('getDayFirstReading', () => {
  it('возвращает первую непрочитанную главу', () => {
    const day = baseDay({
      items: [
        { id: 1, dayNumber: 1, dateStr: '', readText: 'Быт. 1', item: 1, completed: true },
        { id: 2, dayNumber: 1, dateStr: '', readText: 'Быт. 2', item: 2, completed: false },
      ],
    });
    expect(getDayFirstReading(day)).toEqual({ book: 'Бытие', chapter: 2 });
  });

  it('если все главы прочитаны — возвращает первую', () => {
    const day = baseDay({
      items: [
        { id: 1, dayNumber: 1, dateStr: '', readText: 'Быт. 1', item: 1, completed: true },
        { id: 2, dayNumber: 1, dateStr: '', readText: 'Быт. 2', item: 2, completed: true },
      ],
    });
    expect(getDayFirstReading(day)).toEqual({ book: 'Бытие', chapter: 1 });
  });

  it('фолбэк на readings при отсутствии items', () => {
    const day = baseDay({ items: [], readings: [{ book: 'Исход', chapter: 3 }] });
    expect(getDayFirstReading(day)).toEqual({ book: 'Исход', chapter: 3 });
  });

  it('возвращает null и логирует, если нет ни items, ни readings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const day = baseDay({ items: [], readings: [] });
    expect(getDayFirstReading(day)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
