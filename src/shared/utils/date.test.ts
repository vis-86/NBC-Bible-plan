import { describe, expect, it } from 'vitest';
import { pluralizeDays } from './date';

describe('pluralizeDays', () => {
  it('returns «день» for numbers ending in 1 (except 11)', () => {
    expect(pluralizeDays(1)).toBe('день');
    expect(pluralizeDays(21)).toBe('день');
    expect(pluralizeDays(101)).toBe('день');
  });

  it('returns «дня» for numbers ending in 2..4 (except 12..14)', () => {
    expect(pluralizeDays(2)).toBe('дня');
    expect(pluralizeDays(3)).toBe('дня');
    expect(pluralizeDays(4)).toBe('дня');
    expect(pluralizeDays(22)).toBe('дня');
    expect(pluralizeDays(103)).toBe('дня');
  });

  it('returns «дней» for 0 and numbers ending in 5..9 / 0', () => {
    expect(pluralizeDays(0)).toBe('дней');
    expect(pluralizeDays(5)).toBe('дней');
    expect(pluralizeDays(10)).toBe('дней');
    expect(pluralizeDays(25)).toBe('дней');
  });

  it('handles the 11..14 exception', () => {
    expect(pluralizeDays(11)).toBe('дней');
    expect(pluralizeDays(12)).toBe('дней');
    expect(pluralizeDays(13)).toBe('дней');
    expect(pluralizeDays(14)).toBe('дней');
    expect(pluralizeDays(111)).toBe('дней');
    expect(pluralizeDays(112)).toBe('дней');
  });
});
