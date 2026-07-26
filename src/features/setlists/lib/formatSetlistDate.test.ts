import { describe, expect, it } from 'vitest';
import { formatSetlistDate } from './formatSetlistDate';

describe('formatSetlistDate', () => {
  it('null/undefined/битая дата -> null (UI не рендерит строку даты)', () => {
    expect(formatSetlistDate(null)).toBeNull();
    expect(formatSetlistDate(undefined)).toBeNull();
    expect(formatSetlistDate('не-дата')).toBeNull();
  });

  it('форматирует YYYY-MM-DD в "вс, 3 августа"', () => {
    // 2026-08-02 - воскресенье
    expect(formatSetlistDate('2026-08-02')).toBe('вс, 2 августа');
  });

  it('однозначный месяц/день без ведущего нуля', () => {
    // 2026-01-05 - понедельник
    expect(formatSetlistDate('2026-01-05')).toBe('пн, 5 января');
  });
});
